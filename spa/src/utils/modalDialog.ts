/** Mounted modal dialogs are ordered like portals: the last one owns keyboard input. */
export const getActiveModalDialog = (): HTMLElement | undefined =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).at(-1);
