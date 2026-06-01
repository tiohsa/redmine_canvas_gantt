import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const lockPath = path.join(root, 'package-lock.json');
const packagePath = path.join(root, 'package.json');
const registryPrefix = 'https://registry.npmjs.org/';

const allowedInstallScripts = new Set([
  'node_modules/esbuild',
  'node_modules/fsevents',
  'node_modules/playwright/node_modules/fsevents',
]);

const fail = (message) => {
  console.error(`supply-chain check failed: ${message}`);
  process.exitCode = 1;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const manifest = readJson(packagePath);
const lock = readJson(lockPath);
const packages = lock.packages ?? {};
const rootPackage = packages[''];

if (lock.lockfileVersion !== 3) {
  fail(`package-lock.json must use lockfileVersion 3, found ${lock.lockfileVersion}`);
}

if (!rootPackage) {
  fail('package-lock.json is missing the root package entry');
}

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const manifestDeps = manifest[section] ?? {};
  const lockDeps = rootPackage?.[section] ?? {};

  for (const name of Object.keys(manifestDeps)) {
    if (!(name in lockDeps)) {
      fail(`${section}.${name} is missing from package-lock.json root metadata`);
    }
  }

  for (const name of Object.keys(lockDeps)) {
    if (!(name in manifestDeps)) {
      fail(`package-lock.json root metadata contains stale ${section}.${name}`);
    }
  }
}

for (const [packageName, packageInfo] of Object.entries(packages)) {
  if (packageName === '') continue;

  if (packageInfo.link) {
    fail(`${packageName} is a linked dependency`);
    continue;
  }

  if (!packageInfo.integrity) {
    fail(`${packageName} is missing an integrity hash`);
  }

  if (!packageInfo.resolved) {
    fail(`${packageName} is missing a resolved tarball URL`);
  } else if (!packageInfo.resolved.startsWith(registryPrefix)) {
    fail(`${packageName} resolves outside ${registryPrefix}: ${packageInfo.resolved}`);
  }

  if (packageInfo.hasInstallScript && !allowedInstallScripts.has(packageName)) {
    fail(`${packageName} declares an install script and is not in the allowlist`);
  }
}

if (!process.exitCode) {
  console.log(`Supply-chain lockfile check passed for ${Object.keys(packages).length - 1} packages.`);
}
