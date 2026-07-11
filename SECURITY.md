# Security Policy

## Supported Versions

Security fixes are applied to the current `main` branch and released from tags matching `v*`.

## Reporting a Vulnerability

Please report vulnerabilities privately to the repository maintainers. Do not include secrets, live credentials, or exploit traffic captures in public issues.

## Supply Chain Controls

The SPA dependency graph is locked by `spa/package-lock.json` and installed in CI with `npm ci --ignore-scripts`. The repository also includes `spa/.npmrc` with `ignore-scripts=true` so lifecycle scripts do not run during dependency installation by default.

Run the local supply-chain gate before dependency changes:

```sh
cd spa
npm run security
```

This validates that every lockfile package has an integrity hash, resolves from the npm registry, and does not introduce unexpected install scripts. The install-script allowlist is intentionally small and must be reviewed when package updates change it.

GitHub Actions also runs dependency review on pull requests and Dependabot is configured for npm, GitHub Actions, and Docker updates.

## Runtime Asset Safety

Fallback delivery for built SPA assets only serves files under `assets/build`. The controller resolves real paths before serving, so traversal paths and symlinks escaping the build directory are rejected.
