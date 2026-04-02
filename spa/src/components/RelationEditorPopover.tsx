import React from 'react';
import { createPortal } from 'react-dom';

import type { DraftRelation, Relation, Task } from '../types';
import { RelationType, type DefaultRelationType } from '../types/constraints';
import { i18n } from '../utils/i18n';
import { calculateDelay, getRelationInfoText, getRelationTypeLabel, supportsDelayForUiType, toRawRelationType, validateRelationDelayConsistency, type RelationDirection } from '../utils/relationEditing';

type TaskLabel = {
    id: string;
    subject: string;
};

export type RelationPopoverTarget = {
    relation: Relation | DraftRelation;
    relationId: string | null;
    isDraft: boolean;
    direction: RelationDirection;
    initialType: DefaultRelationType;
    initialDelay?: number;
    initialAutoDelayMessage?: string;
    from: TaskLabel;
    to: TaskLabel;
};

const parseDelayInput = (value: string): number | null => {
    if (!/^\d+$/.test(value.trim())) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const RelationEditorPopover: React.FC<{
    popoverRef: React.RefObject<HTMLDivElement | null>;
    target: RelationPopoverTarget;
    taskById: Map<string, Task>;
    relations: Relation[];
    position: { x: number; y: number };
    onClose: () => void;
    onCreate: (draftRelation: DraftRelation, rawType: string, delay?: number) => Promise<void>;
    onUpdate: (relationId: string, rawType: string, delay?: number) => Promise<void>;
    onDelete: (relationId: string) => Promise<void>;
}> = ({ popoverRef, target, taskById, relations, position, onClose, onCreate, onUpdate, onDelete }) => {
    const [relationType, setRelationType] = React.useState<DefaultRelationType>(target.initialType);
    const [delayValue, setDelayValue] = React.useState(target.initialDelay !== undefined ? String(target.initialDelay) : '');
    const [autoDelayMessage, setAutoDelayMessage] = React.useState<string | null>(target.initialAutoDelayMessage ?? null);
    const [error, setError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => {
        setRelationType(target.initialType);
        setDelayValue(target.initialDelay !== undefined ? String(target.initialDelay) : '');
        setAutoDelayMessage(target.initialAutoDelayMessage ?? null);
        setError(null);
        setSaving(false);
    }, [target]);

    const supportsDelay = supportsDelayForUiType(relationType);
    const helperText = getRelationInfoText(relationType);

    const updateDelayForType = React.useCallback((nextType: DefaultRelationType) => {
        setRelationType(nextType);
        setError(null);

        if (!supportsDelayForUiType(nextType)) {
            setDelayValue('');
            setAutoDelayMessage(null);
            return;
        }

        const fromTask = taskById.get(target.from.id);
        const toTask = taskById.get(target.to.id);
        const autoDelay = calculateDelay(RelationType.Precedes, fromTask, toTask);
        setDelayValue(autoDelay.delay !== undefined ? String(autoDelay.delay) : '');
        setAutoDelayMessage(autoDelay.message ?? null);
    }, [target.from.id, target.to.id, taskById]);

    const handleSave = React.useCallback(async () => {
        const rawType = target.isDraft
            ? relationType
            : toRawRelationType(relationType, target.direction);

        let delay: number | undefined;
        if (supportsDelay) {
            if (delayValue.trim() === '') {
                setError(i18n.t('label_relation_delay_required') || 'Delay is required for this relation type');
                return;
            }

            const parsedDelay = parseDelayInput(delayValue);
            if (parsedDelay === null) {
                setError(i18n.t('label_relation_delay_invalid') || 'Delay must be 0 or greater');
                return;
            }
            delay = parsedDelay;
        }

        const consistency = validateRelationDelayConsistency(
            rawType,
            delay,
            taskById.get(target.relation.from),
            taskById.get(target.relation.to)
        );
        if (!consistency.valid) {
            setError(consistency.message);
            return;
        }

        const duplicate = relations.some((relation) => {
            if (!target.isDraft && relation.id === target.relationId) {
                return false;
            }
            return relation.from === target.relation.from && relation.to === target.relation.to && relation.type === rawType;
        });
        if (duplicate) {
            setError(i18n.t('label_relation_already_exists') || 'Relation already exists');
            return;
        }

        setSaving(true);
        try {
            if (target.isDraft) {
                await onCreate(target.relation as DraftRelation, rawType, delay);
            } else if (target.relationId) {
                await onUpdate(target.relationId, rawType, delay);
            }
        } catch (saveError: unknown) {
            setError(saveError instanceof Error ? saveError.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
            setSaving(false);
        }
    }, [delayValue, onCreate, onUpdate, relationType, relations, supportsDelay, target, taskById]);

    const handleDelete = React.useCallback(async () => {
        if (!target.relationId) return;

        setSaving(true);
        try {
            await onDelete(target.relationId);
        } catch (deleteError: unknown) {
            setError(deleteError instanceof Error ? deleteError.message : (i18n.t('label_relation_remove_failed') || 'Failed to remove relation'));
            setSaving(false);
        }
    }, [onDelete, target.relationId]);

    return createPortal(
        <div
            ref={popoverRef}
            data-testid="relation-editor"
            style={{
                position: 'fixed',
                top: position.y,
                left: position.x,
                width: 320,
                boxSizing: 'border-box',
                background: '#fff',
                border: '1px solid rgba(15, 23, 42, 0.12)',
                borderRadius: 12,
                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
                padding: 16,
                zIndex: 10001,
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em', margin: 0 }}>
                        {i18n.t('label_relation_title') || 'Dependency'}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4, margin: 0 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>#{target.from.id}</span> {target.from.subject}
                        {' '}→{' '}
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>#{target.to.id}</span> {target.to.subject}
                    </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
                    <span style={{ fontWeight: 600 }}>{i18n.t('label_relation_type') || 'Relation type'}</span>
                    <select
                        data-testid="relation-type-select"
                        value={relationType}
                        disabled={saving}
                        onChange={(event) => updateDelayForType(event.target.value as DefaultRelationType)}
                        style={{
                            boxSizing: 'border-box',
                            height: 36,
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            padding: '0 10px',
                            fontSize: 13,
                            color: '#0f172a',
                            margin: 0,
                            fontFamily: 'inherit'
                        }}
                    >
                        <option value={RelationType.Precedes}>{getRelationTypeLabel(RelationType.Precedes)}</option>
                        <option value={RelationType.Relates}>{getRelationTypeLabel(RelationType.Relates)}</option>
                        <option value={RelationType.Blocks}>{getRelationTypeLabel(RelationType.Blocks)}</option>
                    </select>
                </label>

                {supportsDelay && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
                        <span style={{ fontWeight: 600 }}>{i18n.t('label_delay') || 'Delay'}</span>
                        <input
                            data-testid="relation-delay-input"
                            type="text"
                            inputMode="numeric"
                            value={delayValue}
                            disabled={saving}
                            placeholder="0"
                            onChange={(event) => {
                                setDelayValue(event.target.value);
                                setError(null);
                            }}
                            style={{
                                boxSizing: 'border-box',
                                height: 36,
                                borderRadius: 8,
                                border: error ? '1px solid #ef4444' : '1px solid #cbd5e1',
                                padding: '0 10px',
                                fontSize: 13,
                                color: '#0f172a',
                                margin: 0,
                                fontFamily: 'inherit'
                            }}
                        />
                    </label>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45, margin: 0 }}>
                        {helperText}
                    </div>
                    {supportsDelay && autoDelayMessage && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, margin: 0 }}>
                            {autoDelayMessage}
                        </div>
                    )}
                    {error && (
                        <div data-testid="relation-error" style={{ fontSize: 12, color: '#dc2626', lineHeight: 1.45, margin: 0 }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                        type="button"
                        data-testid="relation-cancel-button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            boxSizing: 'border-box',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            color: '#334155',
                            borderRadius: 8,
                            padding: '0 12px',
                            height: 32,
                            fontSize: 13,
                            cursor: 'pointer',
                            margin: 0,
                            fontFamily: 'inherit',
                            lineHeight: 1
                        }}
                    >
                        {i18n.t('button_cancel') || 'Cancel'}
                    </button>
                    {!target.isDraft && target.relationId && (
                        <button
                            type="button"
                            data-testid="relation-delete-button"
                            onClick={() => {
                                void handleDelete();
                            }}
                            disabled={saving}
                            style={{
                                boxSizing: 'border-box',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(220, 38, 38, 0.18)',
                                background: '#fff5f5',
                                color: '#dc2626',
                                borderRadius: 8,
                                padding: '0 12px',
                                height: 32,
                                fontSize: 13,
                                cursor: 'pointer',
                                margin: 0,
                                fontFamily: 'inherit',
                                lineHeight: 1
                            }}
                        >
                            {i18n.t('button_delete') || 'Delete'}
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="relation-save-button"
                        onClick={() => {
                            void handleSave();
                        }}
                        disabled={saving}
                        style={{
                            boxSizing: 'border-box',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #1d4ed8',
                            background: '#1d4ed8',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '0 12px',
                            height: 32,
                            fontSize: 13,
                            cursor: 'pointer',
                            margin: 0,
                            fontFamily: 'inherit',
                            lineHeight: 1
                        }}
                    >
                        {i18n.t('button_save') || 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
