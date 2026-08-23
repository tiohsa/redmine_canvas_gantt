import { describe, expect, it } from 'vitest';
import {
    findCompetingLockfiles,
    isAlternativePackageManager
} from './check-supply-chain.mjs';

describe('supply-chain package manager guard', () => {
    it('reports lockfiles owned by non-npm package managers', () => {
        const existingPaths = new Set([
            '/workspace/pnpm-lock.yaml',
            '/workspace/bun.lockb'
        ]);

        expect(findCompetingLockfiles('/workspace', path => existingPaths.has(path))).toEqual([
            'pnpm-lock.yaml',
            'bun.lockb'
        ]);
    });

    it('detects scripts launched through pnpm, Yarn, or Bun', () => {
        expect(isAlternativePackageManager('/tools/pnpm.cjs')).toBe(true);
        expect(isAlternativePackageManager('/tools/yarn.js')).toBe(true);
        expect(isAlternativePackageManager('/tools/bun')).toBe(true);
        expect(isAlternativePackageManager('/tools/npm-cli.js')).toBe(false);
    });
});
