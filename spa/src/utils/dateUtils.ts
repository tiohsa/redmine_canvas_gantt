import { format as dateFnsFormat } from 'date-fns';
import {
    ja, enUS, fr, de, es, zhCN, zhTW, ko, ru, ptBR, it, nl,
    pl, pt, sv, tr, da, fi, nb, hu, cs, sk, uk
} from 'date-fns/locale';

interface RedmineCanvasGanttGlobal {
    language?: string;
    dateFormat?: string;
    yearMonthFormat?: string;
}

const getGlobal = () => (window as unknown as { RedmineCanvasGantt?: RedmineCanvasGanttGlobal }).RedmineCanvasGantt ?? {};

/**
 * Ruby strftime format (%Y, %m, %d, etc) を date-fns フォーマット文字列に変換する。
 * 変換後に残るリテラル文字列（ラテン英字を含む可能性があるもの）は
 * date-fns のシングルクォートエスケープで囲む。
 */
export function convertStrftimeToDateFns(rubyFormat: string): string {
    // strftime トークン → date-fns トークン のマッピング
    const tokenMap: [RegExp, string][] = [
        [/%Y/g,  'yyyy'],
        [/%y/g,  'yy'],
        [/%_m/g, 'M'],
        [/%-d/g, 'd'],
        [/%-m/g, 'M'],
        [/%m/g,  'MM'],
        [/%B/g,  'MMMM'],
        [/%b/g,  'MMM'],
        [/%A/g,  'EEEE'],
        [/%a/g,  'EEE'],
        [/%d/g,  'dd'],
        [/%e/g,  'd'],
        [/%H/g,  'HH'],
        [/%I/g,  'hh'],
        [/%M/g,  'mm'],
        [/%S/g,  'ss'],
        [/%p/g,  'aaa'],
    ];

    // 既知のトークンをプレースホルダーに置換
    const placeholders: string[] = [];
    let result = rubyFormat;

    tokenMap.forEach(([regex, replacement]) => {
        result = result.replace(regex, () => {
            const idx = placeholders.length;
            placeholders.push(replacement);
            return `\x00${idx}\x00`;
        });
    });

    // 未知の %X トークンは除去
    result = result.replace(/%[a-zA-Z]/g, '');

    // プレースホルダーを戻しながら、リテラル部分をエスケープしてつなぐ
    const parts = result.split(/\x00(\d+)\x00/);
    let formatted = '';
    parts.forEach((part, i) => {
        if (i % 2 === 1) {
            // プレースホルダーのインデックス → date-fns トークン
            formatted += placeholders[Number(part)];
        } else if (part.length > 0) {
            // リテラル部分: ラテン文字を含む場合はシングルクォートでエスケープ
            if (/[a-zA-Z]/.test(part)) {
                formatted += `'${part.replace(/'/g, "''")}'`;
            } else {
                formatted += part;
            }
        }
    });

    return formatted;
}

/**
 * 現在のRedmine設定に基づいたロケールオブジェクトを取得する
 */
export function getCurrentLocale() {
    const lang = (getGlobal().language || 'en').toLowerCase();
    const localeMap: Record<string, any> = {
        'en': enUS,
        'ja': ja,
        'fr': fr,
        'de': de,
        'es': es,
        'zh': zhCN,
        'zh-tw': zhTW,
        'ko': ko,
        'ru': ru,
        'pt-br': ptBR,
        'it': it,
        'nl': nl,
        'pl': pl,
        'pt': pt,
        'sv': sv,
        'tr': tr,
        'da': da,
        'fi': fi,
        'nb': nb,
        'no': nb,
        'hu': hu,
        'cs': cs,
        'sk': sk,
        'uk': uk,
    };
    return localeMap[lang] || enUS;
}

/**
 * 現在のRedmine設定に基づいた日付フォーマット文字列（date-fns形式）を取得する
 */
export function getDateFormat(): string {
    let rubyFormat = getGlobal().dateFormat || '%Y-%m-%d';
    return convertStrftimeToDateFns(rubyFormat);
}

/**
 * Redmineの設定に沿って日付をフォーマットする
 */
export function formatDate(date: Date | number | null | undefined): string {
    if (date == null) return '-';
    const d = typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';

    try {
        return dateFnsFormat(d, getDateFormat(), { locale: getCurrentLocale() });
    } catch {
        // フォーマットが解析できない場合はISO形式にフォールバック
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
}

/**
 * 現在のRedmine設定に基づいた「年月」フォーマットを取得する。
 * 日（%d, %e, %-d）の部分を取り除き、区切り文字を正規化して返す。
 */
export function getYearMonthFormat(): string {
    const global = getGlobal();
    if (global.yearMonthFormat) {
        return convertStrftimeToDateFns(global.yearMonthFormat);
    }
    let rubyFormat = global.dateFormat || '%Y-%m-%d';
    // 日トークンとその周囲のリテラル区切り文字を除去
    const yearMonth = rubyFormat
        .replace(/%-d|%d|%e/g, '')
        .replace(/^[-/. ,\u3000\u00a0]+|[-/. ,\u3000\u00a0]+$/g, '')
        .replace(/[-/. ,\u3000\u00a0]{2,}/g, (m) => m[0]);

    const converted = convertStrftimeToDateFns(yearMonth);

    if (!converted || converted.length < 4) return 'yyyy/MM';
    return converted;
}

/**
 * 指定したフォーマットで日付をフォーマットする（ロケールは自動適用）
 */
export function formatExplicit(date: Date | number, formatStr: string): string {
    const d = typeof date === 'number' ? new Date(date) : date;
    try {
        return dateFnsFormat(d, formatStr, { locale: getCurrentLocale() });
    } catch {
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
}
