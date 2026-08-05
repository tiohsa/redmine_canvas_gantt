import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { designTokens } from '../styles/designTokens';
import { i18n } from '../utils/i18n';

/**
 * Keeps conflict resolution explicit after bounded automatic retries. The
 * local patch remains in TaskStore until the user chooses a resolution.
 */
export const ConflictResolutionPanel: React.FC = () => {
    const conflicts = useTaskStore(state => state.taskConflicts);
    const allTasks = useTaskStore(state => state.allTasks);
    const serverTasks = useTaskStore(state => state.serverTaskSnapshot.entitiesById);
    const resolveTaskConflict = useTaskStore(state => state.resolveTaskConflict);
    const entries = Object.values(conflicts);

    if (entries.length === 0) return null;

    return (
        <section
            aria-label={i18n.t('label_conflict_resolution') || 'Conflict resolution'}
            data-testid="conflict-resolution-panel"
            style={{
                position: 'fixed',
                top: '76px',
                right: '20px',
                zIndex: 10000,
                width: 'min(380px, calc(100vw - 40px))',
                padding: '14px',
                border: `1px solid ${designTokens.borderSubtle}`,
                borderRadius: '10px',
                backgroundColor: designTokens.controlBg,
                color: designTokens.textPrimary,
                boxShadow: designTokens.controlActiveShadow,
                fontFamily: 'inherit'
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                {i18n.t('label_conflict_resolution') || 'Resolve conflicting changes'}
            </div>
            {entries.map((conflict) => {
                const localTask = allTasks.find(task => task.id === conflict.taskId);
                const remoteTask = serverTasks[conflict.taskId];
                return (
                    <div
                        key={conflict.taskId}
                        data-testid={`task-conflict-${conflict.taskId}`}
                        style={{
                            padding: '10px 0',
                            borderTop: `1px solid ${designTokens.borderSubtle}`
                        }}
                    >
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>
                            #{conflict.taskId} {localTask?.subject || remoteTask?.subject || ''}
                        </div>
                        <div style={{ color: designTokens.textMuted, fontSize: '12px', margin: '4px 0 8px' }}>
                            {conflict.message}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                data-testid={`conflict-use-remote-${conflict.taskId}`}
                                onClick={() => void resolveTaskConflict(conflict.taskId, 'remote')}
                            >
                                {i18n.t('button_use_remote') || 'Use remote'}
                            </button>
                            <button
                                type="button"
                                data-testid={`conflict-keep-local-${conflict.taskId}`}
                                onClick={() => void resolveTaskConflict(conflict.taskId, 'local')}
                            >
                                {i18n.t('button_keep_local_retry') || 'Keep local & retry'}
                            </button>
                        </div>
                    </div>
                );
            })}
        </section>
    );
};
