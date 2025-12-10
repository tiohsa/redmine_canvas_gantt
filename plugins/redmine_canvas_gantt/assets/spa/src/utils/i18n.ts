export const i18n = {
    t: (key: string): string => {
        // @ts-ignore
        const dict = window.RedmineCanvasGantt?.i18n || {};
        return dict[key] || key;
    }
};
