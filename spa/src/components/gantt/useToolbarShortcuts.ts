import type { RefObject } from 'react';
import { useEffect } from 'react';

import type { ToolbarMenuKey } from './useToolbarMenuState';

type UseToolbarShortcutsParams = {
    closeMenu: (menuKey?: ToolbarMenuKey) => void;
    filterInputRef: RefObject<HTMLInputElement | null>;
    openMenuByKey: (menuKey: ToolbarMenuKey) => void;
    setFilterText: (text: string) => void;
    showFilterMenu: boolean;
};

export const useToolbarShortcuts = ({
    closeMenu,
    filterInputRef,
    openMenuByKey,
    setFilterText,
    showFilterMenu
}: UseToolbarShortcutsParams): void => {
    useEffect(() => {
        if (!showFilterMenu) return;

        const requestId = window.requestAnimationFrame(() => {
            filterInputRef.current?.focus();
            filterInputRef.current?.select();
        });

        return () => window.cancelAnimationFrame(requestId);
    }, [filterInputRef, showFilterMenu]);

    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;

            const key = event.key.toLowerCase();

            if (event.ctrlKey && !event.altKey && !event.metaKey && key === 'f') {
                event.preventDefault();
                event.stopPropagation();
                openMenuByKey('filter');
                return;
            }

            if (key === 'escape' && showFilterMenu) {
                event.preventDefault();
                event.stopPropagation();
                setFilterText('');
                closeMenu('filter');
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
    }, [closeMenu, openMenuByKey, showFilterMenu, setFilterText]);
};
