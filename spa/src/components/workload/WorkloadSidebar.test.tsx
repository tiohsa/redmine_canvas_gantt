import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkloadSidebar } from './WorkloadSidebar';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import type { WorkloadData } from '../../services/WorkloadLogicService';

const ONE_DAY = 24 * 60 * 60 * 1000;

const buildWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 16,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp: 0,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: []
                }],
                ['2026-01-02', {
                    dateStr: '2026-01-02',
                    timestamp: ONE_DAY,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: []
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 0,
    overloadedDayCount: 0
});

const buildOverloadWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 31,
            peakLoad: 13,
            dailyWorkloads: new Map([
                ['2026-01-05', {
                    dateStr: '2026-01-05',
                    timestamp: ONE_DAY * 4,
                    totalLoad: 13,
                    isOverload: true,
                    contributingTasks: []
                }],
                ['2026-01-02', {
                    dateStr: '2026-01-02',
                    timestamp: ONE_DAY,
                    totalLoad: 11,
                    isOverload: true,
                    contributingTasks: []
                }],
                ['2026-01-04', {
                    dateStr: '2026-01-04',
                    timestamp: ONE_DAY * 3,
                    totalLoad: 7,
                    isOverload: false,
                    contributingTasks: []
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 1,
    overloadedDayCount: 2
});

describe('WorkloadSidebar', () => {
    beforeEach(() => {
        useTaskStore.setState({
            ...useTaskStore.getInitialState(),
            viewport: {
                ...useTaskStore.getInitialState().viewport,
                scrollY: 1200,
                rowHeight: 36
            }
        }, true);
        useWorkloadStore.setState(useWorkloadStore.getInitialState(), true);
    });

    it('keeps assignees visible even when the gantt pane is vertically scrolled', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText(/Peak 8.0h/)).toBeInTheDocument();
    });

    it('stretches to fill the workload pane width', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        expect(screen.getByTestId('workload-sidebar')).toHaveStyle({
            flex: '1 1 0%',
            minWidth: '0',
            width: '100%'
        });
    });

    it('reports vertical scroll changes for workload sync', () => {
        const handleScroll = vi.fn();
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar onScroll={handleScroll} />);

        const scrollElement = screen.getByTestId('workload-sidebar-scroll');
        Object.defineProperty(scrollElement, 'scrollTop', {
            value: 72,
            configurable: true,
            writable: true
        });

        scrollElement.dispatchEvent(new Event('scroll'));

        expect(handleScroll).toHaveBeenCalledWith(72);
    });

    it('shows an explicit empty state when no workload data matches the current filters', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: {
                assignees: new Map(),
                overloadedAssigneeCount: 0,
                overloadedDayCount: 0
            }
        });

        render(<WorkloadSidebar />);

        expect(screen.getByText('No workload data matches the current filters.')).toBeInTheDocument();
    });

    it('renders overload as a clickable control that cycles the focused histogram bar', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildOverloadWorkloadData()
        });

        render(<WorkloadSidebar />);

        const overloadControl = screen.getByRole('button', { name: 'Focus overload histogram for Alice' });
        fireEvent.click(overloadControl);

        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });

        fireEvent.click(overloadControl);

        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-05' });
    });
});
