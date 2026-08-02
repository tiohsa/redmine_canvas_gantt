import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBuildArtifacts } from './check-build-artifacts.mjs';

const fixtures = [];

const createFixture = ({ manifest, files = {}, trackedFiles = Object.keys(files), archiveFiles = trackedFiles }) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-gantt-artifacts-'));
    fixtures.push(repoRoot);
    const buildDirectory = path.join(repoRoot, 'assets', 'build');
    const manifestPath = path.join(buildDirectory, '.vite', 'manifest.json');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    Object.entries(files).forEach(([relativePath, source]) => {
        const filePath = path.join(buildDirectory, ...relativePath.split('/'));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, source);
    });

    const trackedPaths = new Set([
        'assets/build/.vite/manifest.json',
        ...trackedFiles.map(file => `assets/build/${file}`)
    ]);
    const archivePaths = new Set([
        'assets/build/.vite/manifest.json',
        ...archiveFiles.map(file => `assets/build/${file}`)
    ]);

    return {
        repoRoot,
        buildDirectory,
        manifestPath,
        gitPathChecker: (command, reference) => (
            (command === 'tracked' ? trackedPaths : archivePaths).has(reference)
        )
    };
};

afterEach(() => {
    while (fixtures.length > 0) fs.rmSync(fixtures.pop(), { recursive: true, force: true });
});

describe('checkBuildArtifacts', () => {
    it('resolves file, css, assets, imports, dynamicImports, and CSS URLs', () => {
        const fixture = createFixture({
            manifest: {
                'src/main.tsx': {
                    file: 'assets/main.js',
                    css: ['assets/main.css'],
                    assets: ['assets/font.woff2'],
                    imports: ['src/shared.ts'],
                    dynamicImports: ['src/lazy.ts']
                },
                'src/shared.ts': { file: 'assets/shared.js' },
                'src/lazy.ts': { file: 'assets/lazy.js' }
            },
            files: {
                'assets/main.js': 'main',
                'assets/main.css': '.app { background: url("./font.woff2?v=1"); }',
                'assets/font.woff2': 'font',
                'assets/shared.js': 'shared',
                'assets/lazy.js': 'lazy'
            }
        });

        expect(checkBuildArtifacts(fixture)).toEqual([]);
    });

    it('reports a missing file reached through dynamicImports', () => {
        const fixture = createFixture({
            manifest: {
                'src/main.tsx': { file: 'assets/main.js', dynamicImports: ['src/lazy.ts'] },
                'src/lazy.ts': { file: 'assets/lazy.js' }
            },
            files: { 'assets/main.js': 'main' }
        });

        expect(checkBuildArtifacts(fixture)).toContain('manifest reference is missing: assets/build/assets/lazy.js');
    });

    it('reports missing manifest entries instead of treating entry keys as files', () => {
        const fixture = createFixture({
            manifest: {
                'src/main.tsx': { file: 'assets/main.js', imports: ['src/missing.ts'] }
            },
            files: { 'assets/main.js': 'main' }
        });

        expect(checkBuildArtifacts(fixture)).toContain('manifest entry reference is missing: src/missing.ts');
    });

    it('reports CSS URL and path traversal violations', () => {
        const cssFixture = createFixture({
            manifest: { 'src/main.tsx': { file: 'assets/main.js', css: ['assets/main.css'] } },
            files: {
                'assets/main.js': 'main',
                'assets/main.css': '.app { background: url("./missing.woff2"); }'
            }
        });
        expect(checkBuildArtifacts(cssFixture)).toContain('manifest reference is missing: assets/build/assets/missing.woff2');

        const traversalFixture = createFixture({
            manifest: { 'src/main.tsx': { file: '../outside.js' } },
            files: {}
        });
        expect(checkBuildArtifacts(traversalFixture)[0]).toContain('manifest reference escapes build directory: ../outside.js');
    });

    it('checks tracked and archive inclusion separately from filesystem presence', () => {
        const fixture = createFixture({
            manifest: { 'src/main.tsx': { file: 'assets/main.js' } },
            files: { 'assets/main.js': 'main' },
            trackedFiles: []
        });

        expect(checkBuildArtifacts(fixture)).toEqual(expect.arrayContaining([
            'manifest reference is not tracked: assets/build/assets/main.js',
            'manifest reference is not present in HEAD tree: assets/build/assets/main.js'
        ]));
    });
});
