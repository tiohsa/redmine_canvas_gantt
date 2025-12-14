export const i18n = {
    t: (key: string): string => {
        const dict = (window as unknown as { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt?.i18n ?? {};
        return dict[key] ?? key;
    }
};
