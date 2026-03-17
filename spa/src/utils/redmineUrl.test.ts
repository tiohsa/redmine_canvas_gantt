import { beforeEach, describe, expect, it } from 'vitest';
import { buildRedmineUrl } from './redmineUrl';

describe('buildRedmineUrl', () => {
    beforeEach(() => {
        window.RedmineCanvasGantt = {
            ...(window.RedmineCanvasGantt ?? {
                projectId: 1,
                apiBase: '',
                redmineBase: '',
                authToken: '',
                apiKey: '',
                nonWorkingWeekDays: [],
                i18n: {}
            }),
            redmineBase: ''
        };
    });

    it('returns root-relative paths unchanged when no subdirectory is configured', () => {
        expect(buildRedmineUrl('/issues/10')).toBe('/issues/10');
    });

    it('prefixes root-relative paths with redmineBase', () => {
        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            redmineBase: '/redmine'
        };

        expect(buildRedmineUrl('/issues/10')).toBe('/redmine/issues/10');
        expect(buildRedmineUrl('/projects/p1/issues/new?parent_issue_id=10#dialog')).toBe('/redmine/projects/p1/issues/new?parent_issue_id=10#dialog');
    });

    it('does not double-prefix already normalized paths', () => {
        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            redmineBase: '/redmine/'
        };

        expect(buildRedmineUrl('/redmine/issues/10')).toBe('/redmine/issues/10');
    });

    it('leaves absolute URLs untouched', () => {
        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            redmineBase: '/redmine'
        };

        expect(buildRedmineUrl('https://example.com/redmine/issues/10')).toBe('https://example.com/redmine/issues/10');
    });
});
