import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { applyIssueDialogStyles, applyLinkTargetBlank, getIssueDialogErrorMessage } from '../utils/iframeStyles';
import { BulkSubtaskCreator } from './BulkSubtaskCreator';
import type { BulkSubtaskCreatorHandle } from './BulkSubtaskCreator';
import { fontFamilies, designTokens } from '../styles/designTokens';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { apiClient } from '../api/client';
import { canApplyReadResponse, createReadContext, type ReadContext } from '../stores/taskStore/stateContract';
import { useTimerStore } from '../stores/TimerStore';

const MAX_DIALOG_VIEWPORT_HEIGHT_RATIO = 0.9;
const MIN_DIALOG_HEIGHT_PX = 600;
const DEFAULT_DIALOG_WIDTH_PX = 1200;
const MIN_DIALOG_WIDTH_PX = 800;

type ObserverWindow = Window & {
    ResizeObserver?: typeof ResizeObserver;
    MutationObserver?: typeof MutationObserver;
};

const getElementOuterHeight = (element: HTMLElement | null): number => {
    if (!element) {
        return 0;
    }

    return Math.ceil(element.getBoundingClientRect().height);
};

const getDocumentScrollHeight = (element: HTMLElement): number => {
    return Math.max(
        element.scrollHeight,
        element.clientHeight,
        element.offsetHeight,
        Math.ceil(element.getBoundingClientRect().height)
    );
};

const getIssueDialogContentHeight = (doc: Document): number => {
    const candidates = [
        doc.querySelector<HTMLElement>('#content'),
        doc.querySelector<HTMLElement>('#main'),
        doc.body,
        doc.documentElement
    ];

    for (const element of candidates) {
        if (!element) {
            continue;
        }

        const height = getDocumentScrollHeight(element);
        if (height > 0) {
            return height;
        }
    }

    return 0;
};

type IssueDialogMode = 'form' | 'saving' | 'issue-show' | 'error';
type SaveTarget = 'issue' | 'new-issue' | 'journal' | 'time_entry' | 'query' | null;

const getIssueShowIdFromPath = (path: string): string | null => {
    const issueMatch = path.match(/\/issues\/(\d+)\/?$/);
    if (!issueMatch) return null;
    if (path.includes('/edit') || path.includes('/new')) return null;
    return issueMatch[1];
};

const findJournalEditForm = (doc: Document): HTMLFormElement | null => {
    return (
        doc.querySelector<HTMLFormElement>('form[action*="/journals/"]') ||
        doc.querySelector<HTMLFormElement>('form[id^="journal-"][id$="-form"]') ||
        doc.querySelector<HTMLTextAreaElement>('textarea[name="journal[notes]"]')?.closest('form') ||
        null
    );
};

const getActiveSaveForm = (doc: Document, currentPath?: string): { form: HTMLFormElement; target: SaveTarget } | null => {
    const journalForm = findJournalEditForm(doc);
    if (journalForm) return { form: journalForm, target: 'journal' };

    const timeEntryForm =
        doc.querySelector<HTMLFormElement>('form[action*="/time_entries"]') ||
        doc.querySelector<HTMLFormElement>('#new_time_entry') ||
        doc.querySelector<HTMLFormElement>('form.new_time_entry') ||
        doc.querySelector<HTMLFormElement>('form[id^="edit_time_entry"]');
    if (timeEntryForm) return { form: timeEntryForm, target: 'time_entry' };

    const issueForm = doc.querySelector<HTMLFormElement>('#issue-form');
    if (issueForm) {
        const path = currentPath ?? doc.defaultView?.location?.pathname ?? '';
        const isNewIssue = path.includes('/issues/new') || /\/projects\/[^/]+\/issues\/new\/?$/.test(path);
        return { form: issueForm, target: isNewIssue ? 'new-issue' : 'issue' };
    }

    const queryForm = doc.querySelector<HTMLFormElement>('#query-form');
    if (queryForm) return { form: queryForm, target: 'query' };

    return null;
};

const submitForm = (form: HTMLFormElement): void => {
    const submitButton = form.querySelector<HTMLElement>('input[type="submit"], button[type="submit"]');

    if (submitButton) {
        submitButton.click();
        return;
    }

    if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
    }

    form.submit();
};

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const issueDialogContext = useUIStore(state => state.issueDialogContext);
    const queryDialogUrl = useUIStore(state => state.queryDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);
    const closeQueryDialog = useUIStore(state => state.closeQueryDialog);
    const refreshData = useTaskStore(state => state.refreshData);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const bulkRef = React.useRef<BulkSubtaskCreatorHandle>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const bulkSectionRef = React.useRef<HTMLDivElement>(null);
    const footerRef = React.useRef<HTMLDivElement>(null);
    const errorRef = React.useRef<HTMLDivElement>(null);
    const iframeEscapeCleanupRef = React.useRef<(() => void) | null>(null);
    const iframeSizeObserverCleanupRef = React.useRef<(() => void) | null>(null);
    const dialogResizeCleanupRef = React.useRef<(() => void) | null>(null);
    const isSavingRef = React.useRef(false);
    const pendingAutoSubmitRef = React.useRef(false);
    const trackerReadContextRef = React.useRef<ReadContext | null>(null);
    const trackerReadGenerationRef = React.useRef(0);
    const saveTargetRef = React.useRef<SaveTarget>(null);
    const [iframeError, setIframeError] = React.useState<string | null>(null);
    const [dialogMode, setDialogMode] = React.useState<IssueDialogMode>('form');
    const [currentIframeUrl, setCurrentIframeUrl] = React.useState<string | null>(null);
    const [displayedIssueId, setDisplayedIssueId] = React.useState<string | null>(null);
    const [saveTarget, setSaveTarget] = React.useState<SaveTarget>(null);
    const [isJournalEditing, setIsJournalEditing] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [dialogHeightPx, setDialogHeightPx] = React.useState<number | null>(null);
    const [isIframeLoaded, setIsIframeLoaded] = React.useState(false);
    const [trackerOptions, setTrackerOptions] = React.useState<Array<{ id: number; name: string }>>([]);
    const [defaultTrackerId, setDefaultTrackerId] = React.useState<number | undefined>(undefined);
    const [hasBulkSubjects, setHasBulkSubjects] = React.useState(false);
    const activeDialogUrl = queryDialogUrl || issueDialogUrl;
    const isQueryDialog = Boolean(queryDialogUrl);

    const handleClose = React.useCallback(() => {
        if (queryDialogUrl) {
            closeQueryDialog();
        } else {
            closeIssueDialog();
        }
        void refreshData();
    }, [closeIssueDialog, closeQueryDialog, queryDialogUrl, refreshData]);

    const measureDialogHeight = React.useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) {
            setDialogHeightPx(Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO));
            return;
        }

        const maxHeightPx = Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO);
        const chromeHeight =
            getElementOuterHeight(headerRef.current) +
            getElementOuterHeight(errorRef.current) +
            getElementOuterHeight(bulkSectionRef.current) +
            getElementOuterHeight(footerRef.current);
        const iframeContentHeight = getIssueDialogContentHeight(doc);
        const nextHeight = Math.min(
            maxHeightPx,
            Math.max(MIN_DIALOG_HEIGHT_PX, chromeHeight + iframeContentHeight)
        );

        setDialogHeightPx(nextHeight);
    }, []);

    const detectSaveTarget = React.useCallback((doc: Document, currentPath?: string) => {
        const activeSaveForm = getActiveSaveForm(doc, currentPath);
        const nextSaveTarget = activeSaveForm?.target ?? null;
        setSaveTarget(nextSaveTarget);
        setIsJournalEditing(nextSaveTarget === 'journal');
    }, []);

    const handleJournalSaveCompletion = React.useCallback((doc: Document): boolean => {
        if (!isSavingRef.current || saveTargetRef.current !== 'journal') {
            return false;
        }

        const error = getIssueDialogErrorMessage(doc);
        setIframeError(error);
        const journalForm = findJournalEditForm(doc);

        if (!error && !journalForm) {
            saveTargetRef.current = null;
            setSaveTarget(null);
            setIsJournalEditing(false);
            setDialogMode('issue-show');
            isSavingRef.current = false;
            setIsSaving(false);
            void refreshData().catch((refreshError) => {
                console.debug('Failed to refresh after comment save', refreshError);
            });
            return true;
        }

        if (error) {
            saveTargetRef.current = 'journal';
            setSaveTarget('journal');
            setIsJournalEditing(true);
            setDialogMode('error');
            isSavingRef.current = false;
            setIsSaving(false);
            return true;
        }

        return false;
    }, [refreshData]);

    const bindIframeSizeObservers = React.useCallback((doc: Document) => {
        iframeSizeObserverCleanupRef.current?.();

        const cleanupCallbacks: Array<() => void> = [];
        const iframeWindow = iframeRef.current?.contentWindow as ObserverWindow | null;
        const resizeObserverCtor = iframeWindow?.ResizeObserver ?? window.ResizeObserver;
        const mutationObserverCtor = iframeWindow?.MutationObserver ?? window.MutationObserver;

        if (typeof resizeObserverCtor !== 'undefined') {
            const resizeObserver = new resizeObserverCtor(() => {
                measureDialogHeight();
            });
            const resizeTargets = [
                doc.querySelector<HTMLElement>('#content'),
                doc.querySelector<HTMLElement>('#main'),
                doc.body,
                doc.documentElement
            ].filter((element): element is HTMLElement => Boolean(element));

            resizeTargets.forEach((element) => resizeObserver.observe(element));
            cleanupCallbacks.push(() => resizeObserver.disconnect());
        }

        if (typeof mutationObserverCtor !== 'undefined') {
            const mutationObserver = new mutationObserverCtor(() => {
                measureDialogHeight();
                if (!handleJournalSaveCompletion(doc)) {
                    detectSaveTarget(doc);
                }
            });
            mutationObserver.observe(doc.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });
            cleanupCallbacks.push(() => mutationObserver.disconnect());
        }

        iframeSizeObserverCleanupRef.current = () => {
            cleanupCallbacks.forEach((cleanup) => cleanup());
        };
    }, [detectSaveTarget, handleJournalSaveCompletion, measureDialogHeight]);

    const handleIframeLoad = React.useCallback(async () => {
        try {
            const iframe = iframeRef.current;
            if (!iframe) return;

            const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
            if (!doc) return;

            const currentUrl = iframe.contentWindow?.location.href || '';
            setCurrentIframeUrl(currentUrl || null);
            const urlParsed = new URL(currentUrl, window.location.origin);
            const isIssueShowPage = !isQueryDialog && Boolean(getIssueShowIdFromPath(urlParsed.pathname));

            applyIssueDialogStyles(doc, isQueryDialog, isIssueShowPage);
            applyLinkTargetBlank(doc);
            const trackerSelect = doc.querySelector<HTMLSelectElement>('select[name="issue[tracker_id]"]');
            if (trackerSelect) {
                const options = Array.from(trackerSelect.options)
                    .map(option => ({ id: Number(option.value), name: option.textContent?.trim() || '' }))
                    .filter(option => Number.isInteger(option.id) && option.id > 0 && option.name);
                setTrackerOptions(options);
                const selected = Number(trackerSelect.value);
                setDefaultTrackerId(Number.isInteger(selected) && selected > 0 ? selected : undefined);
            }
            if (isIssueShowPage && !isSavingRef.current) {
                setDisplayedIssueId(getIssueShowIdFromPath(urlParsed.pathname));
                setDialogMode('issue-show');
            }
            bindIframeSizeObservers(doc);

            setIsIframeLoaded(true);

            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && typeof iframeWindow.addEventListener === 'function') {
                iframeEscapeCleanupRef.current?.();
                const handleIframeEscape = (event: KeyboardEvent) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleClose();
                    }
                };
                iframeWindow.addEventListener('keydown', handleIframeEscape, true);
                iframeEscapeCleanupRef.current = () => {
                    iframeWindow.removeEventListener('keydown', handleIframeEscape, true);
                };
            }

            const loadedUrl = iframeWindow?.location.href || '';
            setCurrentIframeUrl(loadedUrl || null);

            const error = getIssueDialogErrorMessage(doc);
            setIframeError(error);
            window.requestAnimationFrame(() => {
                measureDialogHeight();
            });

            if (handleJournalSaveCompletion(doc)) {
                return;
            }

            detectSaveTarget(doc, urlParsed.pathname);

            if (pendingAutoSubmitRef.current) {
                const issueForm = doc.querySelector<HTMLFormElement>('#issue-form');
                if (issueForm && urlParsed.pathname.match(/\/issues\/\d+\/edit\/?$/)) {
                    pendingAutoSubmitRef.current = false;
                    saveTargetRef.current = 'issue';
                    setSaveTarget('issue');
                    submitForm(issueForm);
                    return;
                }
            }

            const handleFormSubmit = (event: Event) => {
                const form = event.target as HTMLFormElement | null;
                const detected = getActiveSaveForm(doc, urlParsed.pathname);
                const target = detected?.target ?? (
                    form?.id === 'new_time_entry' || form?.action?.includes('/time_entries') ? 'time_entry' :
                    form?.id === 'issue-form' ? 'issue' :
                    form?.id === 'query-form' ? 'query' : null
                );
                if (target) {
                    saveTargetRef.current = target;
                    setSaveTarget(target);
                    isSavingRef.current = true;
                    setIsSaving(true);
                    setDialogMode('saving');
                }
            };
            doc.addEventListener('submit', handleFormSubmit, true);

            const previousUrl = currentIframeUrl || activeDialogUrl || '';
            const wasTimeEntryForm = saveTargetRef.current === 'time_entry' || previousUrl.includes('/time_entries');
            const urlParsedAfterLoad = new URL(loadedUrl, window.location.origin);
            const pathAfterLoad = urlParsedAfterLoad.pathname;
            const issueIdAfterLoad = getIssueShowIdFromPath(pathAfterLoad);

            const isTimeEntryFormPage = pathAfterLoad.includes('/time_entries/new') || (pathAfterLoad.includes('/time_entries') && (pathAfterLoad.includes('/new') || pathAfterLoad.includes('/edit')));
            const hasTimeEntrySuccessNotice = Boolean(doc.querySelector('.flash.notice'));
            const isTimeEntrySuccessDestination = !isTimeEntryFormPage && (
                hasTimeEntrySuccessNotice ||
                Boolean(issueIdAfterLoad) ||
                pathAfterLoad.includes('/time_entries') ||
                (pathAfterLoad.includes('/projects/') && pathAfterLoad.endsWith('/issues'))
            );
            const timerRecordingIssueMatches = !issueDialogContext?.timerRecording ||
                !issueIdAfterLoad ||
                String(issueIdAfterLoad) === String(issueDialogContext.timerRecording.issueId);

            const isTimeEntrySuccess = isSavingRef.current && wasTimeEntryForm && !error &&
                isTimeEntrySuccessDestination && timerRecordingIssueMatches;

            if (isTimeEntrySuccess) {
                if (issueDialogContext?.timerRecording) {
                    void useTimerStore.getState().completeTimerRecording(issueDialogContext.timerRecording);
                }
                saveTargetRef.current = null;
                setSaveTarget(null);
                isSavingRef.current = false;
                setIsSaving(false);
                handleClose();
                return;
            }

            // If we were saving, update dialog mode when Redmine redirects after submit.
            // Validation failures usually remain on /edit or /new and keep error blocks in DOM.
            if (isSavingRef.current) {
                const isQuerySuccess = isQueryDialog && !error && (
                    pathAfterLoad.endsWith('/issues') ||
                    pathAfterLoad.includes('/projects/') && pathAfterLoad.endsWith('/issues') ||
                    pathAfterLoad.match(/\/queries\/\d+$/) // some plugins redirect here
                );

                if (!error && issueIdAfterLoad && !isQueryDialog) {
                    if (
                        (saveTargetRef.current === 'issue' || saveTargetRef.current === 'new-issue') &&
                        bulkRef.current?.hasSubjects()
                    ) {
                        await bulkRef.current.createSubtasks(issueIdAfterLoad);
                    }

                    setDisplayedIssueId(issueIdAfterLoad);
                    saveTargetRef.current = null;
                    setSaveTarget(null);
                    setIsJournalEditing(false);
                    setDialogMode('issue-show');
                    isSavingRef.current = false;
                    setIsSaving(false);
                    await refreshData();
                    return;
                }

                if (!error && isQuerySuccess) {
                    saveTargetRef.current = null;
                    isSavingRef.current = false;
                    setIsSaving(false);
                    handleClose();
                    return;
                }

                const reloadedIssueForm = doc.querySelector<HTMLFormElement>('#issue-form');
                if (!error && saveTargetRef.current === 'issue' && reloadedIssueForm && pathAfterLoad.match(/\/issues\/\d+\/edit\/?$/)) {
                    setDialogMode('saving');
                    setIsSaving(true);
                    return;
                }

                setDialogMode(error ? 'error' : 'form');
                detectSaveTarget(doc);
                isSavingRef.current = false;
                setIsSaving(false);
            }
        } catch (e) {
            console.debug("Could not verify iframe URL", e);
            if (isSavingRef.current) {
                isSavingRef.current = false;
                setIsSaving(false);
            }
            setDialogHeightPx(Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO));
        }
    }, [activeDialogUrl, bindIframeSizeObservers, currentIframeUrl, detectSaveTarget, handleClose, handleJournalSaveCompletion, isQueryDialog, issueDialogContext, measureDialogHeight, refreshData]);

    const handleSave = React.useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;

        const currentPath = iframeRef.current?.contentWindow?.location?.pathname;
        const saveForm = getActiveSaveForm(doc, currentPath);
        if (!saveForm) return;

        saveTargetRef.current = saveForm.target;
        isSavingRef.current = true;
        setSaveTarget(saveForm.target);
        setIsJournalEditing(saveForm.target === 'journal');
        setDialogMode('saving');
        setIsSaving(true);
        submitForm(saveForm.form);
    }, []);

    const handleIssueShowPrimaryAction = React.useCallback(() => {
        if (!displayedIssueId || !iframeRef.current?.contentWindow) return;

        if (!hasBulkSubjects) {
            const editUrl = buildRedmineUrl(`/issues/${displayedIssueId}/edit`);
            iframeRef.current.contentWindow.location.href = editUrl;
            setCurrentIframeUrl(editUrl);
            setDialogMode('form');
            setDisplayedIssueId(null);
            setSaveTarget('issue');
            setIsJournalEditing(false);
            setIframeError(null);
            bulkRef.current?.resetCycle();
            return;
        }

        const editUrl = buildRedmineUrl(`/issues/${displayedIssueId}/edit`);
        pendingAutoSubmitRef.current = true;
        saveTargetRef.current = 'issue';
        isSavingRef.current = true;
        setSaveTarget('issue');
        setDialogMode('saving');
        setIsSaving(true);
        setIframeError(null);
        iframeRef.current.contentWindow.location.href = editUrl;
        setCurrentIframeUrl(editUrl);
    }, [displayedIssueId, hasBulkSubjects]);

    const { issueLabel, issueSubject } = React.useMemo(() => {
        if (displayedIssueId && !isQueryDialog) {
            const task = useTaskStore.getState().tasks.find(t => String(t.id) === displayedIssueId);
            if (task) {
                const label = `${task.trackerName || i18n.t('label_issue') || 'Issue'} #${task.id}`;
                return { issueLabel: label, issueSubject: task.subject || '' };
            }
            const label = `${i18n.t('label_issue') || 'Issue'} #${displayedIssueId}`;
            return { issueLabel: label, issueSubject: '' };
        }

        if (!activeDialogUrl) return { issueLabel: '', issueSubject: '' };
        if (isQueryDialog) {
            return {
                issueLabel: i18n.t('label_saved_query_editor') || 'Saved Query Editor',
                issueSubject: ''
            };
        }

        const url = activeDialogUrl.split('?')[0];

        // 1. Try to extract issue ID from /issues/123 or /issues/123/edit
        const issueMatch = url.match(/\/issues\/(\d+)(?:\/edit)?/);
        if (issueMatch) {
            const issueId = issueMatch[1];
            // Try to find the task in the store to get more info (Tracker, etc.)
            const task = useTaskStore.getState().tasks.find(t => String(t.id) === issueId);
            if (task) {
                const label = `${task.trackerName || i18n.t('label_issue') || 'Issue'} #${task.id}`;
                return { issueLabel: label, issueSubject: task.subject || '' };
            }
            const label = `${i18n.t('label_issue') || 'Issue'} #${issueId}`;
            return { issueLabel: label, issueSubject: '' };
        }

        // 2. Handle new issue
        if (url.includes('/issues/new')) {
            const label = i18n.t('label_issue_new') || (i18n.t('label_new') ? `${i18n.t('label_new')} ${i18n.t('label_issue')}` : 'New Issue');
            return { issueLabel: label, issueSubject: '' };
        }

        // 3. General "Edit" fallback
        const label = i18n.t('button_edit') || 'Edit';
        return { issueLabel: label, issueSubject: '' };
    }, [activeDialogUrl, displayedIssueId, isQueryDialog]);

    const parentId = React.useMemo(() => {
        if (!activeDialogUrl || isQueryDialog) return undefined;

        try {
            const urlParsed = new URL(activeDialogUrl, window.location.origin);
            const path = urlParsed.pathname;
            const params = urlParsed.searchParams;

            let paId = params.get('issue[parent_issue_id]') || params.get('parent_issue_id') || undefined;

            // The issue itself is the parent for subtasks from both the edit and
            // show dialogs. New issues have no stable parent until they are saved.
            const issueMatch = path.match(/\/issues\/(\d+)(?:\/edit)?/);
            if (issueMatch) {
                paId = issueMatch[1];
            }

            return paId;
        } catch (e) {
            console.error("Failed to parse issue dialog URL", e);
            return undefined;
        }
    }, [activeDialogUrl, isQueryDialog]);
    const parentTask = useTaskStore(state => parentId ? state.tasks.find(task => task.id === parentId) : undefined);
    const canBulkCreateForParent = !parentTask?.isContextOnly;

    React.useEffect(() => {
        if (!parentId || isQueryDialog || !canBulkCreateForParent) return;

        const operationIssueIds = useTaskStore.getState().tasks
            .filter(task => !task.isContextOnly)
            .map(task => task.id);
        const context = createReadContext({
            generation: ++trackerReadGenerationRef.current,
            projectId: useTaskStore.getState().currentProjectId,
            query: { parentId, operationIssueIds },
            scope: { dialog: activeDialogUrl },
            purpose: 'subtask_trackers',
            mergePolicy: 'replace'
        });
        trackerReadContextRef.current = context;
        void apiClient.getSubtaskTrackers(parentId, operationIssueIds)
            .then(options => {
                if (canApplyReadResponse(trackerReadContextRef.current, context) && options.length > 0) setTrackerOptions(options);
            })
            .catch(error => {
                console.debug('Failed to load subtask tracker options', error);
            });
        return () => {
            if (trackerReadContextRef.current?.contextId === context.contextId) trackerReadContextRef.current = null;
        };
    }, [activeDialogUrl, canBulkCreateForParent, isQueryDialog, parentId]);

    React.useEffect(() => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        iframeSizeObserverCleanupRef.current?.();
        iframeSizeObserverCleanupRef.current = null;
        setIframeError(null);
        setDialogMode('form');
        setCurrentIframeUrl(null);
        setDisplayedIssueId(null);
        setSaveTarget(null);
        setIsJournalEditing(false);
        saveTargetRef.current = null;
        isSavingRef.current = false;
        pendingAutoSubmitRef.current = false;
        setIsSaving(false);
        setDialogHeightPx(null);
        setIsIframeLoaded(false);
        setTrackerOptions([]);
        setDefaultTrackerId(undefined);
        setHasBulkSubjects(false);
    }, [activeDialogUrl]);

    React.useEffect(() => {
        if (!activeDialogUrl) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            handleClose();
        };

        window.addEventListener('keydown', handleEscape, true);
        return () => {
            window.removeEventListener('keydown', handleEscape, true);
        };
    }, [activeDialogUrl, handleClose]);

    React.useEffect(() => () => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        iframeSizeObserverCleanupRef.current?.();
        iframeSizeObserverCleanupRef.current = null;
        dialogResizeCleanupRef.current?.();
        dialogResizeCleanupRef.current = null;
    }, []);

    React.useEffect(() => {
        if (!activeDialogUrl) {
            return;
        }

        const handleResize = () => {
            measureDialogHeight();
        };

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                measureDialogHeight();
            })
            : null;

        [headerRef.current, bulkSectionRef.current, footerRef.current, errorRef.current]
            .filter((element): element is HTMLDivElement => Boolean(element))
            .forEach((element) => resizeObserver?.observe(element));

        window.addEventListener('resize', handleResize);
        dialogResizeCleanupRef.current = () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver?.disconnect();
        };

        measureDialogHeight();

        return () => {
            dialogResizeCleanupRef.current?.();
            dialogResizeCleanupRef.current = null;
        };
    }, [activeDialogUrl, iframeError, measureDialogHeight]);

    if (!activeDialogUrl) return null;

    const externalDialogUrl = currentIframeUrl || activeDialogUrl;
    const isIssueShowMode = dialogMode === 'issue-show' && !isQueryDialog;
    const isJournalSaveMode = saveTarget === 'journal' || isJournalEditing;
    const shouldShowSave =
        !isQueryDialog ||
        saveTarget === 'query' ||
        (isSaving && saveTargetRef.current === 'query');
    const closeLabel = isIssueShowMode || isJournalSaveMode ? (i18n.t('button_close') || 'Close') : (i18n.t('button_cancel') || 'Cancel');
    const saveLabel = saveTarget === 'new-issue'
        ? (i18n.t('button_create_issue') || 'Create issue')
        : saveTarget === 'journal'
            ? (i18n.t('button_save_comment') || 'Save comment')
            : saveTarget === 'issue'
                ? (i18n.t('button_save_issue') || 'Save issue')
                : saveTarget === 'time_entry'
                    ? (i18n.t('button_log_time') || i18n.t('button_save') || 'Log time')
                    : (i18n.t('button_save') || 'Save');
    const savingLabel = saveTarget === 'journal'
        ? (i18n.t('label_saving_comment') || 'Saving comment...')
        : (i18n.t('label_loading') || 'Saving...');

    const compactHeaderPadding = '2px 12px';
    const compactFooterPadding = '2px 12px 4px 12px';
    const compactIconButtonSize = 24;
    const compactActionButtonHeight = 28;
    const compactActionButtonMinWidth = 88;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: designTokens.surfaceOverlay,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2400,
                fontFamily: fontFamilies.ui,
                fontSize: '13px',
                lineHeight: 1.5
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleClose();
                }
            }}
        >
            <div
                style={{
                    width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
                    maxWidth: '98vw',
                    minWidth: `${MIN_DIALOG_WIDTH_PX}px`,
                    height: dialogHeightPx ? `${dialogHeightPx}px` : `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
                    maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
                    backgroundColor: '#ffffff',
                    borderRadius: '13px',
                    boxShadow: '0px 0px 22.576px rgba(0,0,0,0.08), 6.5px 2px 17.5px rgba(44,30,116,0.11)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    border: '1px solid rgba(0,0,0,0.06)'
                }}
            >
                {/* Header - Fixed Height */}
                <div
                    data-testid="issue-dialog-header"
                    ref={headerRef}
                    style={{
                        flex: '0 0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: compactHeaderPadding,
                        backgroundColor: designTokens.controlBg,
                        borderBottom: `1px solid ${designTokens.controlBorder}`
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, paddingRight: '16px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: designTokens.controlFg, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {issueLabel}
                        </span>
                        {issueSubject && (
                            <span style={{ fontSize: '14px', color: designTokens.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {issueSubject}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <a
                            href={externalDialogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open issue in new tab"
                            onClick={() => handleClose()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: `${compactIconButtonSize}px`,
                                height: `${compactIconButtonSize}px`,
                                borderRadius: '9999px',
                                border: `1px solid rgba(0,0,0,0.1)`,
                                backgroundColor: 'rgba(0,0,0,0.04)',
                                color: designTokens.textMuted,
                                transition: 'background 0.2s'
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button
                            type="button"
                            onClick={handleClose}
                            aria-label="Close issue dialog"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: `${compactIconButtonSize}px`,
                                height: `${compactIconButtonSize}px`,
                                borderRadius: '9999px',
                                border: `1px solid rgba(0,0,0,0.1)`,
                                backgroundColor: 'rgba(0,0,0,0.04)',
                                color: designTokens.textMuted,
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body Content - Scrollable if Iframe is big (though Iframe has internal scroll) */}
                <div style={{ flex: '1 1 auto', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {iframeError ? (
                        <div
                            data-testid="issue-dialog-error"
                            ref={errorRef}
                            style={{
                                flex: '0 0 auto',
                                padding: '12px 16px',
                                backgroundColor: designTokens.errorBg,
                                color: designTokens.errorFg,
                                borderBottom: `1px solid ${designTokens.errorBorder}`,
                                fontSize: 13
                            }}
                        >
                            {iframeError}
                        </div>
                    ) : null}
                    <iframe
                        ref={iframeRef}
                        src={activeDialogUrl}
                        onLoad={handleIframeLoad}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            flex: 1
                        }}
                        className={isIframeLoaded ? undefined : 'issue-iframe-loading'}
                    />
                </div>

                {/* Bulk Creation Section - Only for Issues */}
                {!isQueryDialog && canBulkCreateForParent && (
                    <div ref={bulkSectionRef} style={{ flex: '0 0 auto', padding: '8px 16px 0 16px', backgroundColor: designTokens.controlBg, borderTop: `1px solid ${designTokens.controlBorder}` }}>
                        <BulkSubtaskCreator
                            ref={bulkRef}
                            parentId={parentId}
                            hideStandaloneButton={true}
                            showTopBorder={false}
                            trackerOptions={trackerOptions}
                            defaultTrackerId={defaultTrackerId}
                            onContentChange={setHasBulkSubjects}
                            onTasksCreated={(metadata) => {
                                if (parentId) {
                                    useTaskStore.getState().applyTaskMutationMetadata(parentId, metadata);
                                } else {
                                    void refreshData();
                                }
                            }}
                        />
                    </div>
                )}

                {/* Footer Buttons - Fixed Height */}
                <div
                    data-testid="issue-dialog-footer"
                    ref={footerRef}
                    style={{
                        flex: '0 0 auto',
                        padding: compactFooterPadding,
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '8px',
                        backgroundColor: '#ffffff',
                        borderTop: '1px solid rgba(0,0,0,0.06)'
                    }}
                >
                    <button
                        onClick={handleClose}
                        disabled={isSaving}
                            style={{
                                height: `${compactActionButtonHeight}px`,
                                padding: '0 16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#f0f0f0',
                                color: '#222222',
                                border: 'none',
                                borderRadius: 9999,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: isSaving ? 'default' : 'pointer',
                                minWidth: `${compactActionButtonMinWidth}px`,
                                boxSizing: 'border-box',
                                transition: 'background 0.2s'
                            }}
                    >
                        {closeLabel}
                    </button>
                    {isIssueShowMode && !isJournalSaveMode ? (
                        <button
                            onClick={handleIssueShowPrimaryAction}
                            disabled={isSaving}
                            style={{
                                height: `${compactActionButtonHeight}px`,
                                padding: '0 16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#181e25',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 9999,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: isSaving ? 'default' : 'pointer',
                                minWidth: `${compactActionButtonMinWidth}px`,
                                boxSizing: 'border-box',
                                transition: 'background 0.2s'
                            }}
                        >
                            {hasBulkSubjects
                                ? (i18n.t('button_save') || 'Save')
                                : (i18n.t('button_edit_issue') || 'Edit issue')}
                        </button>
                    ) : shouldShowSave ? (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{
                                height: `${compactActionButtonHeight}px`,
                                padding: '0 16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: isSaving ? '#8e8e93' : '#181e25',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 9999,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: isSaving ? 'default' : 'pointer',
                                minWidth: `${compactActionButtonMinWidth}px`,
                                boxSizing: 'border-box',
                                transition: 'background 0.2s',
                                opacity: isSaving ? 0.7 : 1
                            }}
                        >
                            {isSaving ? savingLabel : saveLabel}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
