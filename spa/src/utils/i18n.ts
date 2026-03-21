export const i18n = {
    t: (key: string, params?: Record<string, string | number>): string | undefined => {
        const dict = (window as unknown as { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt?.i18n ?? {};
        let text = dict[key];
        if (text && params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text!.replace(new RegExp(`%\\{${k}\\}`, 'g'), String(v));
            });
        }
        return text;
    }
};

