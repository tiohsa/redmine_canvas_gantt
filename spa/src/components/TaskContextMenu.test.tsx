import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskContextMenu } from './TaskContextMenu';

const defaultProps = {
    taskId: '100',
    contextTask: null,
    relatedRelations: [],
    position: { x: 0, y: 0 },
    contextMenuRef: React.createRef<HTMLDivElement>(),
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onAddChild: vi.fn(),
    onAddNew: vi.fn(),
    onUnsetParent: vi.fn(),
    onDelete: vi.fn(),
    onRemoveRelation: vi.fn(),
    getTaskLabel: (taskId: string) => ({ id: taskId, subject: `Task ${taskId}` })
};

describe('TaskContextMenu', () => {
    it('hides add-child action for context-only rows', () => {
        render(<TaskContextMenu {...defaultProps} canAddChild={false} />);

        expect(screen.queryByTestId('context-menu-add-child-task')).not.toBeInTheDocument();
    });

    it('shows add-child action for operation-scope rows', () => {
        render(<TaskContextMenu {...defaultProps} canAddChild={true} />);

        expect(screen.getByTestId('context-menu-add-child-task')).toBeInTheDocument();
    });
});
