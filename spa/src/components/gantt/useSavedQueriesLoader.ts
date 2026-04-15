import { useEffect, useRef } from 'react';

type UseSavedQueriesLoaderParams = {
    loadSavedQueries: (force?: boolean) => Promise<void>;
    savedQueriesReloadToken: number;
    savedQueriesStatus: 'idle' | 'loading' | 'ready' | 'error';
    showQueryMenu: boolean;
};

export const useSavedQueriesLoader = ({
    loadSavedQueries,
    savedQueriesReloadToken,
    savedQueriesStatus,
    showQueryMenu
}: UseSavedQueriesLoaderParams): void => {
    const handledSavedQueriesReloadTokenRef = useRef(0);

    useEffect(() => {
        if (showQueryMenu && savedQueriesStatus === 'idle') {
            void loadSavedQueries();
        }
    }, [loadSavedQueries, savedQueriesStatus, showQueryMenu]);

    useEffect(() => {
        if (savedQueriesReloadToken <= 0) return;
        if (handledSavedQueriesReloadTokenRef.current >= savedQueriesReloadToken) return;

        handledSavedQueriesReloadTokenRef.current = savedQueriesReloadToken;
        void loadSavedQueries(true);
    }, [loadSavedQueries, savedQueriesReloadToken]);
};
