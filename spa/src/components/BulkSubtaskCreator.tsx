import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import { apiClient } from '../api/client';

interface BulkSubtaskCreatorProps {
    parentId?: string;
    onTasksCreated?: () => void;
    hideStandaloneButton?: boolean;
    showTopBorder?: boolean;
}

export interface BulkSubtaskCreatorHandle {
    createSubtasks: (newParentId?: string) => Promise<{ success: number; fail: number }>;
    hasSubjects: () => boolean;
}

export const BulkSubtaskCreator = React.forwardRef<BulkSubtaskCreatorHandle, BulkSubtaskCreatorProps>(
    ({ parentId, onTasksCreated, hideStandaloneButton, showTopBorder = true }, ref) => {
        const [expanded, setExpanded] = React.useState(false);
        const [subjects, setSubjects] = React.useState('');
        const [loading, setLoading] = React.useState(false);
        const addNotification = useUIStore(state => state.addNotification);

        const createSubtasks = async (newParentId?: string) => {
            const subjectsList = subjects.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            if (subjectsList.length === 0) return { success: 0, fail: 0 };

            setLoading(true);
            let successCount = 0;
            let failCount = 0;

            try {
                const targetParentId = newParentId || parentId;
                if (!targetParentId) {
                    addNotification(i18n.t('label_failed_to_save') || 'Failed to save', 'error');
                    return { success: 0, fail: subjectsList.length };
                }

                const result = await apiClient.bulkCreateSubtasks({
                    parentId: targetParentId,
                    subjects: subjectsList
                });
                successCount = result.successCount;
                failCount = result.failCount;

                if (successCount > 0) {
                    addNotification(i18n.t('label_bulk_subtask_count_success', { count: successCount }) || `${successCount} tasks created.`, 'success');
                    setSubjects('');
                    setExpanded(false);
                    onTasksCreated?.();
                }

                if (failCount > 0) {
                    const firstError = result.results.find((row) => row.status === 'error' && row.errors && row.errors.length > 0);
                    const detail = firstError?.errors?.[0];
                    const defaultMessage = i18n.t('label_bulk_subtask_count_failed', { count: failCount }) || `${failCount} tasks failed.`;
                    addNotification(detail ? `${defaultMessage} (${detail})` : defaultMessage, 'error');
                }
                return { success: successCount, fail: failCount };
            } catch (e) {
                console.error(e);
                addNotification(i18n.t('label_failed_to_save') || 'Failed to save', 'error');
                return { success: successCount, fail: failCount };
            } finally {
                setLoading(false);
            }
        };

        React.useImperativeHandle(ref, () => ({
            createSubtasks,
            hasSubjects: () => subjects.split('\n').map(s => s.trim()).filter(s => s.length > 0).length > 0
        }));

        const handleCreateStandalone = async () => {
            await createSubtasks();
        };

        return (
            <div style={{
                marginTop: showTopBorder ? 12 : 0,
                borderTop: showTopBorder ? '1px solid #e0e0e0' : 'none',
                paddingTop: 8
            }}>
                <div
                    onClick={() => setExpanded(!expanded)}
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}
                >
                    <div style={{
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        marginRight: 6,
                        fontSize: 10,
                        color: '#666'
                    }}>
                        ▶
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                        {i18n.t('label_bulk_subtask_creation') || 'Bulk Ticket Creation'}
                    </div>
                </div>

                {expanded && (
                    <div style={{ paddingLeft: 16 }}>
                        <textarea
                            value={subjects}
                            onChange={(e) => setSubjects(e.target.value)}
                            placeholder={i18n.t('placeholder_bulk_subtask_creation') || "Enter one ticket subject per line..."}
                            disabled={loading}
                            rows={5}
                            style={{
                                width: '100%',
                                padding: 8,
                                fontSize: 13,
                                border: '1px solid #ccc',
                                borderRadius: 4,
                                resize: 'vertical',
                                marginBottom: 8,
                                boxSizing: 'border-box'
                            }}
                        />
                        {!hideStandaloneButton && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={handleCreateStandalone}
                                    disabled={loading || !subjects.trim()}
                                    style={{
                                        padding: '6px 12px',
                                        background: loading || !subjects.trim() ? '#ccc' : '#1a73e8',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 4,
                                        fontSize: 13,
                                        cursor: loading || !subjects.trim() ? 'default' : 'pointer'
                                    }}
                                >
                                    {loading ? (i18n.t('label_loading') || 'Creating...') : (i18n.t('button_create') || 'Create')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }
);
