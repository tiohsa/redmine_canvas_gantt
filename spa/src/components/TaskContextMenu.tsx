import React from 'react';
import { createPortal } from 'react-dom';

import type { Relation, Task } from '../types';
import { i18n } from '../utils/i18n';

type TaskLabel = {
    id: string;
    subject: string;
};

export type TaskContextMenuProps = {
    taskId: string;
    contextTask: Task | null;
    relatedRelations: Relation[];
    position: { x: number; y: number } | null;
    contextMenuRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onEdit: (taskId: string) => void;
    onAddChild: (taskId: string) => void;
    onAddNew: () => void;
    onUnsetParent: (taskId: string) => void;
    onDelete: (taskId: string) => void;
    onRemoveRelation: (relationId: string) => void;
    getTaskLabel: (taskId: string) => TaskLabel;
};

export const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
    taskId,
    contextTask,
    relatedRelations,
    position,
    contextMenuRef,
    onClose,
    onEdit,
    onAddChild,
    onAddNew,
    onUnsetParent,
    onDelete,
    onRemoveRelation,
    getTaskLabel
}) => {
    const formatRelationLabel = React.useCallback((relation: Relation) => {
        return {
            from: getTaskLabel(relation.from),
            to: getTaskLabel(relation.to)
        };
    }, [getTaskLabel]);

    return createPortal(
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    background: 'transparent'
                }}
                onClick={onClose}
                onContextMenu={(event) => {
                    event.preventDefault();
                    onClose();
                }}
            />
            <div
                ref={contextMenuRef}
                style={{
                    position: 'fixed',
                    top: position?.y ?? 0,
                    left: position?.x ?? 0,
                    background: 'white',
                    borderRadius: '8px',
                    minWidth: '200px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1)',
                    padding: '6px',
                    zIndex: 10000,
                    pointerEvents: 'auto',
                    animation: 'fadeIn 0.1s ease-out'
                }}
            >
                <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .menu-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 6px;
                    font-size: 13px;
                    color: #333;
                    transition: background-color 0.1s;
                }
                .menu-item:hover {
                    background-color: #f0f4f9;
                }
                .menu-item.danger {
                    color: #d32f2f;
                }
                .menu-item.danger:hover {
                    background-color: #fee;
                }
                .menu-divider {
                    height: 1px;
                    background-color: #eee;
                    margin: 6px 0;
                }
                .menu-section-title {
                    font-size: 11px;
                    font-weight: 700;
                    color: #888;
                    padding: 6px 12px 2px;
                    text-transform: uppercase;
                }
            `}</style>

                <div className="menu-item" onClick={() => onEdit(taskId)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    {i18n.t('button_edit')}
                </div>

                <div className="menu-item" data-testid="context-menu-add-child-task" onClick={() => onAddChild(taskId)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    {i18n.t('label_add_child_task') || 'Add Child Task'}
                </div>

                <div className="menu-item" data-testid="context-menu-add-new-ticket" onClick={onAddNew}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {i18n.t('label_issue_new') || 'Add New Ticket'}
                </div>

                {contextTask && onUnsetParent && (
                    <div className="menu-item" data-testid="context-menu-unset-parent" onClick={() => onUnsetParent(contextTask.id)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 12h8" />
                            <path d="M9 7l-5 5 5 5" />
                            <path d="M20 7h-6a4 4 0 0 0-4 4" />
                        </svg>
                        {i18n.t('label_unset_parent_task') || 'Remove Parent'}
                    </div>
                )}

                <div className="menu-item danger" onClick={() => onDelete(taskId)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                    {i18n.t('button_delete')}
                </div>

                {relatedRelations.length > 0 && (
                    <>
                        <div className="menu-divider" />
                        <div className="menu-section-title">
                            {i18n.t('label_relations_remove_heading') || 'Remove dependency'}
                        </div>

                        {relatedRelations.map((relation) => {
                            const { from, to } = formatRelationLabel(relation);
                            const fromIsContext = taskId === from.id;
                            const direction = fromIsContext ? '→' : '←';

                            return (
                                <div
                                    key={relation.id}
                                    className="menu-item danger"
                                    data-testid={`remove-relation-${relation.id}`}
                                    onClick={() => onRemoveRelation(relation.id)}
                                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                                >
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18.36 6.64a9 9 0 1 1-12.73 12.73 9 9 0 0 1 12.73-12.73z" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                        <span style={{ fontWeight: 600 }}>#{relation.id}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                                        {from.subject} {direction} {to.subject}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </>,
        document.body
    );
};
