# Supply Chain Security Policy

This repository uses JavaScript/TypeScript tooling in the SPA, so dependency and CI integrity must be treated as part of the security boundary.

## Required practices

- Use the committed lockfile when installing dependencies.
- Prefer lockfile-based installs such as `npm ci` when a `package-lock.json` exists.
- Do not regenerate lockfiles casually during unrelated changes.
- Review dependency update PRs before merging, especially for packages with install scripts.
- Avoid mixing package managers in the same package directory.
- Keep GitHub Actions permissions minimal. Default workflow permissions should be `contents: read` unless write access is explicitly required.
- Do not use `pull_request_target` for untrusted code checkout or dependency installation.
- Avoid broad `actions/cache` reuse across untrusted pull requests.

## Incident response checklist

When an npm supply-chain incident is reported:

1. Search dependency manifests and lockfiles for the affected package scope.
2. Check whether CI or local installs ran during the affected publication window.
3. Review GitHub Actions workflows for `pull_request_target`, dependency install steps, and cache usage.
4. Pin affected dependencies to known-safe versions.
5. Rotate tokens or secrets if malicious install scripts may have run in CI or developer environments.
6. Run the Supply Chain Audit workflow before merging remediation changes.

## TanStack-specific check

```bash
cd spa
grep -R "@tanstack/" package.json pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null
```

If a TanStack package is found, verify the exact resolved version in the lockfile and pin it if needed.
