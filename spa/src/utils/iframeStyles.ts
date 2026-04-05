export const ISSUE_DIALOG_STYLE_ID = 'rcg-issue-dialog-style';

const ISSUE_DIALOG_HIDE_SELECTORS = [
    '#top-menu',
    '#header',
    '#main-menu',
    '#sidebar',
    '#footer',
    '#quick-search',
    // '#content > .tabs > ul', // May hide "Preview" tabs
    // '#content > .tabs > ul li',
    // '#content .tabs > ul',
    // '#content .tabs > ul li',
    '#content > h2',
    '#content > .contextual',
    // Hide only issue form action rows to avoid hiding nested modal dialog buttons
    // (e.g. "new version" dialog opened from the issue form).
    '#issue-form > p.buttons',
    '#issue-form > .buttons',
    '#issue-form > input[type="submit"]',
    '#issue-form > a[href*="preview"]',
    '#issue-form a[href*="/issues"]',
    '#issue-form a[onclick*="history.back"]',
    '#query-form > p.buttons',
    '#query-form > .buttons',
    '#query-form > input[type="submit"]',
    '#query-form > a[href*="preview"]',
    '#query-form a[href*="/queries"]',
    '#query-form a[onclick*="history.back"]'
];

const SHARED_DIALOG_CSS = `
html, body, #wrapper, #main { height: auto !important; min-height: 0 !important; }
html, body { overflow-y: auto !important; }
#content { margin: 0 !important; padding: 16px !important; }
body { background: #fff !important; }
`;

const ISSUE_DIALOG_ERROR_SELECTORS = [
    '#errorExplanation',
    '.errorExplanation',
    '#flash_error',
    '.flash.error',
    '.conflict'
];

export const applyIssueDialogStyles = (doc: Document, isQuery = false): void => {
    if (doc.getElementById(ISSUE_DIALOG_STYLE_ID)) return;

    const querySelectors = [
        '#query-form > p.buttons',
        '#query-form > .buttons',
        '#query-form > input[type="submit"]',
        '#query-form > a[href*="preview"]',
        '#query-form a[href*="/queries"]',
        '#query-form a[onclick*="history.back"]'
    ];

    const selectorsToHide = ISSUE_DIALOG_HIDE_SELECTORS.filter(selector => {
        if (isQuery && querySelectors.includes(selector)) {
            return false;
        }
        return true;
    });

    const style = doc.createElement('style');
    style.id = ISSUE_DIALOG_STYLE_ID;
    style.textContent = `
        ${selectorsToHide.join(', ')} { display: none !important; }
        ${SHARED_DIALOG_CSS}
    `;
    doc.head.appendChild(style);
};

export const findIssueDialogErrorElement = (doc: Document): HTMLElement | null => {
    for (const selector of ISSUE_DIALOG_ERROR_SELECTORS) {
        const element = doc.querySelector(selector);
        if (element instanceof HTMLElement) return element;
    }
    return null;
};

export const getIssueDialogErrorMessage = (doc: Document): string | null => {
    const element = findIssueDialogErrorElement(doc);
    if (!element) return null;

    const message = element.textContent?.trim();
    if (!message) return null;

    return message;
};
