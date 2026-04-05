import React from 'react';

export type ToolbarMenuKey =
    | 'query'
    | 'column'
    | 'filter'
    | 'assignee'
    | 'project'
    | 'version'
    | 'status'
    | 'rowHeight'
    | 'relationSettings'
    | 'export'
    | 'workload'
    | 'baselineSave';

type ToolbarMenuRefs = Record<ToolbarMenuKey, React.RefObject<HTMLDivElement | null>>;

export const useToolbarMenuState = () => {
    const [openMenu, setOpenMenu] = React.useState<ToolbarMenuKey | null>(null);

    const queryRef = React.useRef<HTMLDivElement>(null);
    const columnRef = React.useRef<HTMLDivElement>(null);
    const filterRef = React.useRef<HTMLDivElement>(null);
    const assigneeRef = React.useRef<HTMLDivElement>(null);
    const projectRef = React.useRef<HTMLDivElement>(null);
    const versionRef = React.useRef<HTMLDivElement>(null);
    const statusRef = React.useRef<HTMLDivElement>(null);
    const rowHeightRef = React.useRef<HTMLDivElement>(null);
    const relationSettingsRef = React.useRef<HTMLDivElement>(null);
    const exportRef = React.useRef<HTMLDivElement>(null);
    const workloadRef = React.useRef<HTMLDivElement>(null);
    const baselineSaveRef = React.useRef<HTMLDivElement>(null);

    const refsByMenu = React.useMemo<ToolbarMenuRefs>(() => ({
        query: queryRef,
        column: columnRef,
        filter: filterRef,
        assignee: assigneeRef,
        project: projectRef,
        version: versionRef,
        status: statusRef,
        rowHeight: rowHeightRef,
        relationSettings: relationSettingsRef,
        export: exportRef,
        workload: workloadRef,
        baselineSave: baselineSaveRef
    }), []);

    React.useEffect(() => {
        if (!openMenu) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const activeMenu = refsByMenu[openMenu];
            if (activeMenu.current && !activeMenu.current.contains(target)) {
                setOpenMenu(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenu, refsByMenu]);

    const isMenuOpen = React.useCallback((menuKey: ToolbarMenuKey) => openMenu === menuKey, [openMenu]);

    const toggleMenu = React.useCallback((menuKey: ToolbarMenuKey) => {
        setOpenMenu((current) => current === menuKey ? null : menuKey);
    }, []);

    const openMenuByKey = React.useCallback((menuKey: ToolbarMenuKey) => {
        setOpenMenu(menuKey);
    }, []);

    const closeMenu = React.useCallback((menuKey?: ToolbarMenuKey) => {
        setOpenMenu((current) => {
            if (menuKey && current !== menuKey) {
                return current;
            }
            return null;
        });
    }, []);

    return {
        queryMenuRef: queryRef,
        columnMenuRef: columnRef,
        filterMenuRef: filterRef,
        assigneeMenuRef: assigneeRef,
        projectMenuRef: projectRef,
        versionMenuRef: versionRef,
        statusMenuRef: statusRef,
        rowHeightMenuRef: rowHeightRef,
        relationSettingsMenuRef: relationSettingsRef,
        exportMenuRef: exportRef,
        workloadMenuRef: workloadRef,
        baselineSaveMenuRef: baselineSaveRef,
        isMenuOpen,
        toggleMenu,
        openMenuByKey,
        closeMenu
    };
};
