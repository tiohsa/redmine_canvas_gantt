import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskContextMenu } from './TaskContextMenu';
import type { Task } from '../types';

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

const progressTask = {
    id: '100',
    subject: 'Progress task',
    ratioDone: 40,
    statusId: 1,
    lockVersion: 1,
    editable: true,
    rowIndex: 0,
    hasChildren: false
} as Task;

describe('TaskContextMenu', () => {
    it('hides add-child action for context-only rows', () => {
        render(<TaskContextMenu {...defaultProps} canAddChild={false} />);

        expect(screen.queryByTestId('context-menu-add-child-task')).not.toBeInTheDocument();
    });

    it('shows add-child action for operation-scope rows', () => {
        render(<TaskContextMenu {...defaultProps} canAddChild={true} />);

        expect(screen.getByTestId('context-menu-add-child-task')).toBeInTheDocument();
    });

    it('shows progress choices and identifies the current value', () => {
        render(
            <TaskContextMenu
                {...defaultProps}
                contextTask={progressTask}
                showProgressEdit
                canEditProgress
                progressValue={progressTask.ratioDone}
            />
        );

        fireEvent.click(screen.getByTestId('context-menu-progress'));

        expect(screen.getByTestId('context-menu-progress-options')).toBeInTheDocument();
        expect(screen.getByTestId('context-menu-progress-option-40')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getAllByRole('menuitemradio')).toHaveLength(11);
        expect(screen.getByTestId('context-menu-progress-option-0')).toBeInTheDocument();
        expect(screen.getByTestId('context-menu-progress-option-100')).toBeInTheDocument();
    });

    it('calls the progress callback and closes after selecting a value', () => {
        const onProgressChange = vi.fn();
        const onClose = vi.fn();
        render(
            <TaskContextMenu
                {...defaultProps}
                contextTask={progressTask}
                showProgressEdit
                canEditProgress
                progressValue={progressTask.ratioDone}
                onProgressChange={onProgressChange}
                onClose={onClose}
            />
        );

        fireEvent.click(screen.getByTestId('context-menu-progress'));
        fireEvent.click(screen.getByTestId('context-menu-progress-option-60'));

        expect(onProgressChange).toHaveBeenCalledWith(60);
        expect(onClose).toHaveBeenCalled();
    });

    it('shows a disabled progress action without opening choices', () => {
        render(
            <TaskContextMenu
                {...defaultProps}
                contextTask={progressTask}
                showProgressEdit
                canEditProgress={false}
                progressValue={progressTask.ratioDone}
            />
        );

        const progressAction = screen.getByTestId('context-menu-progress');
        expect(progressAction).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(progressAction);

        expect(screen.queryByTestId('context-menu-progress-options')).not.toBeInTheDocument();
    });
});
