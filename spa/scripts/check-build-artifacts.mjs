import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const REFERENCE_FIELDS = new Set(['file', 'css', 'assets']);
const ENTRY_REFERENCE_FIELDS = new Set(['imports', 'dynamicImports']);

const normalizeReference = (value, baseDirectory = '') => {
    if (typeof value !== 'string' || value.length === 0) return null;
    const withoutQuery = value.split(/[?#]/, 1)[0];
    if (!withoutQuery || withoutQuery.startsWith('/') || /^[a-z]+:/i.test(withoutQuery)) return null;

    const normalized = path.posix.normalize(path.posix.join(baseDirectory, withoutQuery.replaceAll('\\', '/')));
    if (normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`manifest reference escapes build directory: ${value}`);
    }
    return normalized;
};

const collectManifestReferences = (manifest) => {
    const references = new Set();
    const visitedEntries = new Set();
    const addReference = (value, baseDirectory = '') => {
        if (Array.isArray(value)) {
            value.forEach(entry => addReference(entry, baseDirectory));
            return;
        }
        const normalized = normalizeReference(value, baseDirectory);
        if (normalized) references.add(normalized);
    };

    const visitEntry = (entryKey) => {
        if (visitedEntries.has(entryKey)) return;
        const entry = manifest[entryKey];
        if (!entry || typeof entry !== 'object') return;
        visitedEntries.add(entryKey);
        Object.entries(entry).forEach(([field, value]) => {
            if (REFERENCE_FIELDS.has(field)) {
                addReference(value);
                return;
            }
            if (ENTRY_REFERENCE_FIELDS.has(field)) {
                const entryKeys = Array.isArray(value) ? value : [value];
                entryKeys.forEach((dependencyKey) => {
                    if (typeof dependencyKey !== 'string' || !manifest[dependencyKey]) {
                        throw new Error(`manifest entry reference is missing: ${String(dependencyKey)}`);
                    }
                    visitEntry(dependencyKey);
                });
            }
        });
    };

    Object.keys(manifest).forEach(visitEntry);

    return references;
};

const collectCssReferences = (buildDirectory, references) => {
    const cssFiles = [...references].filter(reference => reference.endsWith('.css'));
    cssFiles.forEach((cssReference) => {
        const cssPath = path.join(buildDirectory, ...cssReference.split('/'));
        if (!fs.existsSync(cssPath)) return;
        const source = fs.readFileSync(cssPath, 'utf8');
        const cssDirectory = path.posix.dirname(cssReference);
        const urlPattern = /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g;
        for (const match of source.matchAll(urlPattern)) {
            const value = match[2];
            if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('//')) continue;
            const normalized = normalizeReference(value, cssDirectory);
            if (normalized) references.add(normalized);
        }
    });
};

const gitHasPath = (repoRoot, command, reference, archiveRef) => {
    try {
        const args = command === 'tracked'
            ? ['ls-files', '--error-unmatch', '--', reference]
            : ['ls-tree', '-r', '--name-only', archiveRef, '--', reference];
        const output = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return output.split('\n').some(line => line === reference);
    } catch {
        return false;
    }
};

export const checkBuildArtifacts = ({
    repoRoot,
    buildDirectory = path.join(repoRoot, 'assets', 'build'),
    manifestPath = path.join(buildDirectory, '.vite', 'manifest.json'),
    archiveRef = 'HEAD',
    gitPathChecker = (command, reference, ref) => gitHasPath(repoRoot, command, reference, ref)
}) => {
    const failures = [];
    if (!fs.existsSync(manifestPath)) {
        return [`manifest does not exist: ${path.relative(repoRoot, manifestPath)}`];
    }

    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        return [`manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
    }

    let references;
    try {
        references = collectManifestReferences(manifest);
        collectCssReferences(buildDirectory, references);
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        return failures;
    }

    const manifestReference = path.relative(repoRoot, manifestPath).split(path.sep).join('/');
    if (!gitPathChecker('tracked', manifestReference, archiveRef)) {
        failures.push(`manifest is not tracked: ${manifestReference}`);
    }
    if (!gitPathChecker('archive', manifestReference, archiveRef)) {
        failures.push(`manifest is not present in ${archiveRef} tree: ${manifestReference}`);
    }

    references.forEach((reference) => {
        const repositoryPath = `assets/build/${reference}`;
        const filesystemPath = path.join(buildDirectory, ...reference.split('/'));
        if (!fs.existsSync(filesystemPath)) {
            failures.push(`manifest reference is missing: ${repositoryPath}`);
            return;
        }
        if (!gitPathChecker('tracked', repositoryPath, archiveRef)) {
            failures.push(`manifest reference is not tracked: ${repositoryPath}`);
        }
        if (!gitPathChecker('archive', repositoryPath, archiveRef)) {
            failures.push(`manifest reference is not present in ${archiveRef} tree: ${repositoryPath}`);
        }
    });

    return failures;
};

const main = () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..');
    const archiveFlagIndex = process.argv.indexOf('--archive-ref');
    const archiveRef = archiveFlagIndex >= 0 ? process.argv[archiveFlagIndex + 1] : 'HEAD';
    if (!archiveRef) {
        console.error('build artifact check failed: --archive-ref requires a git ref');
        process.exitCode = 1;
        return;
    }

    const failures = checkBuildArtifacts({ repoRoot, archiveRef });
    if (failures.length > 0) {
        console.error('build artifact integrity check failed:');
        failures.forEach(failure => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log(`Build artifact integrity check passed for ${archiveRef}.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
