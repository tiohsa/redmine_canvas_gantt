import React from 'react';

import { useUIStore } from '../../stores/UIStore';
import type { ColumnConfig, SidebarColumnDefinition } from './sidebarColumnSettings';
import { mergeColumnSettings } from './sidebarColumnSettings';

type ColumnOption = SidebarColumnDefinition & { label: string };

type UseColumnMenuDragArgs = {
    columnSettings: ColumnConfig[];
    visibleColumns: string[];
    columnOptions: ColumnOption[];
    menuContentRef: React.RefObject<HTMLDivElement | null>;
};

type UseColumnMenuDragResult = {
    effectiveColumnSettings: ColumnConfig[];
    orderedColumnOptions: ColumnOption[];
    draggingColumnKey: string | null;
    dropBeforeColumnKey: string | null;
    handleColumnDragStart: (key: string, event: React.DragEvent<HTMLElement>) => void;
    handleColumnDragOver: (key: string, event: React.DragEvent<HTMLElement>) => void;
    handleColumnDrop: (key: string, event: React.DragEvent<HTMLElement>) => void;
    handleColumnMenuDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    clearColumnDragState: () => void;
    reorderColumnByDrag: (sourceKey: string, targetKey: string) => void;
};

const createNextColumnSettings = (
    currentSettings: ColumnConfig[],
    sourceKey: string,
    targetKey: string
): ColumnConfig[] => {
    if (sourceKey === targetKey) return currentSettings;

    const currentOrder = currentSettings.map((entry) => entry.key);
    const sourceIndex = currentOrder.indexOf(sourceKey);
    const targetIndex = currentOrder.indexOf(targetKey);
    if (sourceIndex === -1 || targetIndex === -1) return currentSettings;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(sourceIndex, 1);
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextOrder.splice(adjustedTargetIndex, 0, moved);

    return nextOrder.map((key) => currentSettings.find((entry) => entry.key === key) ?? { key, visible: false });
};

export const useColumnMenuDrag = ({
    columnSettings,
    visibleColumns,
    columnOptions,
    menuContentRef
}: UseColumnMenuDragArgs): UseColumnMenuDragResult => {
    const [draggingColumnKey, setDraggingColumnKey] = React.useState<string | null>(null);
    const [dropBeforeColumnKey, setDropBeforeColumnKey] = React.useState<string | null>(null);

    const effectiveColumnSettings = React.useMemo(
        () => mergeColumnSettings(columnSettings, columnOptions, visibleColumns),
        [columnOptions, columnSettings, visibleColumns]
    );

    const orderedColumnOptions = React.useMemo(() => {
        return effectiveColumnSettings
            .map((setting) => columnOptions.find((option) => option.key === setting.key))
            .filter((option): option is ColumnOption => Boolean(option));
    }, [columnOptions, effectiveColumnSettings]);

    const reorderColumnByDrag = React.useCallback((sourceKey: string, targetKey: string) => {
        const nextSettings = createNextColumnSettings(effectiveColumnSettings, sourceKey, targetKey);
        if (nextSettings === effectiveColumnSettings) return;

        useUIStore.setState({
            columnSettings: nextSettings,
            visibleColumns: nextSettings.filter((entry) => entry.visible).map((entry) => entry.key)
        });
    }, [effectiveColumnSettings]);

    const handleColumnDragStart = React.useCallback((key: string, event: React.DragEvent<HTMLElement>) => {
        // Delay state updates to the next frame to allow the browser to capture 
        // the correct drag preview image before React re-renders with the "dragging" state
        requestAnimationFrame(() => {
            setDraggingColumnKey(key);
            setDropBeforeColumnKey(key);
        });

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', key);
        }
    }, []);

    const handleColumnDragOver = React.useCallback((key: string, event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        setDropBeforeColumnKey(key);
    }, []);

    const handleColumnMenuDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        const container = menuContentRef.current;
        if (!container) return;

        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const topZone = rect.top + 36;
        const bottomZone = rect.bottom - 36;
        const pointerY = event.clientY;

        if (pointerY < topZone) {
            container.scrollTop = Math.max(0, container.scrollTop - 24);
        } else if (pointerY > bottomZone) {
            container.scrollTop = container.scrollTop + 24;
        }
    }, [menuContentRef]);

    const handleColumnDrop = React.useCallback((key: string, event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        const sourceKey = draggingColumnKey || event.dataTransfer?.getData('text/plain');
        if (!sourceKey) return;
        reorderColumnByDrag(sourceKey, key);
        setDraggingColumnKey(null);
        setDropBeforeColumnKey(null);
    }, [draggingColumnKey, reorderColumnByDrag]);

    const clearColumnDragState = React.useCallback(() => {
        setDraggingColumnKey(null);
        setDropBeforeColumnKey(null);
    }, []);

    return {
        effectiveColumnSettings,
        orderedColumnOptions,
        draggingColumnKey,
        dropBeforeColumnKey,
        handleColumnDragStart,
        handleColumnDragOver,
        handleColumnDrop,
        handleColumnMenuDragOver,
        clearColumnDragState,
        reorderColumnByDrag
    };
};
