import { describe, expect, it, vi } from 'vitest';
import { convertStrftimeToDateFns, getYearMonthFormat, getCurrentLocale, getYearMonthOrder } from './dateUtils';

describe('dateUtils', () => {
    describe('convertStrftimeToDateFns', () => {
        it('converts common Redmine strftime tokens to date-fns tokens', () => {
            expect(convertStrftimeToDateFns('%Y-%m-%d')).toBe('yyyy-MM-dd');
            expect(convertStrftimeToDateFns('%d/%m/%Y')).toBe('dd/MM/yyyy');
            expect(convertStrftimeToDateFns('%Y年%m月%d日')).toBe('yyyy年MM月dd日');
        });
    });

    describe('getYearMonthFormat', () => {
        it('derives month-year format from full date format', () => {
            // Mock global window object
            vi.stubGlobal('RedmineCanvasGantt', {
                dateFormat: '%Y-%m-%d'
            });
            expect(getYearMonthFormat()).toBe('yyyy-MM');

            vi.stubGlobal('RedmineCanvasGantt', {
                dateFormat: '%d/%m/%Y'
            });
            expect(getYearMonthFormat()).toBe('MM/yyyy');

            vi.stubGlobal('RedmineCanvasGantt', {
                dateFormat: '%d/%m/%Y',
                yearMonthFormat: '%Y年%m月'
            });
            expect(getYearMonthFormat()).toBe('yyyy年MM月');

            vi.stubGlobal('RedmineCanvasGantt', {
                dateFormat: '%m-%d-%Y'
            });
            expect(getYearMonthFormat()).toBe('MM-yyyy');
            
            vi.unstubAllGlobals();
        });
    });

    describe('getCurrentLocale', () => {
        it('returns correct locale based on Redmine language setting (case-insensitive)', () => {
            vi.stubGlobal('RedmineCanvasGantt', { language: 'en' });
            expect(getCurrentLocale().code).toBe('en-US');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'JA' });
            expect(getCurrentLocale().code).toBe('ja');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'fr' });
            expect(getCurrentLocale().code).toBe('fr');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'zh-TW' });
            expect(getCurrentLocale().code).toBe('zh-TW');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'pt-br' });
            expect(getCurrentLocale().code).toBe('pt-BR');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'pl' });
            expect(getCurrentLocale().code).toBe('pl');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'UNKNOWN' });
            expect(getCurrentLocale().code).toBe('en-US');

            vi.unstubAllGlobals();
        });

        it('falls back by language prefix and normalizes separators', () => {
            vi.stubGlobal('RedmineCanvasGantt', { language: 'en-GB' });
            expect(getCurrentLocale().code).toBe('en-US');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'pt_BR' });
            expect(getCurrentLocale().code).toBe('pt-BR');

            vi.stubGlobal('RedmineCanvasGantt', { language: 'zh-HK' });
            expect(getCurrentLocale().code).toBe('zh-CN');

            vi.stubGlobal('RedmineCanvasGantt', { language: '' });
            expect(getCurrentLocale().code).toBe('en-US');

            vi.unstubAllGlobals();
        });
    });

    describe('getYearMonthOrder', () => {
        it('detects year-month order from Redmine format', () => {
            vi.stubGlobal('RedmineCanvasGantt', { dateFormat: '%Y-%m-%d' });
            expect(getYearMonthOrder()).toBe('year-month');

            vi.stubGlobal('RedmineCanvasGantt', { dateFormat: '%m/%d/%Y' });
            expect(getYearMonthOrder()).toBe('month-year');

            vi.stubGlobal('RedmineCanvasGantt', { yearMonthFormat: '%m月%Y年' });
            expect(getYearMonthOrder()).toBe('month-year');

            vi.unstubAllGlobals();
        });
    });
});
