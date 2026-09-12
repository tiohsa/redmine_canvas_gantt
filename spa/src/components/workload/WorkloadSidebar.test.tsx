import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkloadSidebar } from './WorkloadSidebar';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import type { WorkloadData } from '../../services/WorkloadLogicService';
import type { Task } from '../../types';
import { useUIStore } from '../../stores/UIStore';
import { WORKLOAD_HEADER_HEIGHT } from '../../constants';

const setScrollMetrics = (element: HTMLElement, { clientHeight, scrollHeight, scrollTop }: { clientHeight: number; scrollHeight: number; scrollTop: number }) => {
    Object.defineProperties(element, {
        clientHeight: { configurable: true, value: clientHeight },
        scrollHeight: { configurable: true, value: scrollHeight },
        scrollTop: { configurable: true, writable: true, value: scrollTop }
    });
};

const ONE_DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 5, 12);

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: START,
    dueDate: START,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const buildWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            plannedTotal: 16,
            actualTotal: 0,
            actualPeak: 0,
            plannedPeak: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp: 0,
                    plannedLoad: 8,
                    actualHours: 0,
                    actualContributions: [],
                    isActualOverload: false,
                    isPlannedOverload: false,
                    plannedContributions: []
                }],
                ['2026-01-02', {
                    dateStr: '2026-01-02',
                    timestamp: ONE_DAY,
                    plannedLoad: 8,
                    actualHours: 0,
                    actualContributions: [],
                    isActualOverload: false,
                    isPlannedOverload: false,
                    plannedContributions: []
                }]
            ])
        }]
    ]),
    plannedOverloadedAssigneeCount: 0,
    actualOverloadedAssigneeCount: 0,
    actualOverloadedDayCount: 0,
    plannedOverloadedDayCount: 0
});

const buildOverloadWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            plannedTotal: 31,
            actualTotal: 0,
            actualPeak: 0,
            plannedPeak: 13,
            dailyWorkloads: new Map([
                ['2026-01-05', {
                    dateStr: '2026-01-05',
                    timestamp: ONE_DAY * 4,
                    plannedLoad: 13,
                    actualHours: 0,
                    actualContributions: [],
                    isActualOverload: false,
                    isPlannedOverload: true,
                    plannedContributions: [
                        {
                            task: buildTask({
                                id: 'task-late',
                                subject: 'Task Late',
                                assignedToId: 1,
                                assignedToName: 'Alice',
                                projectId: 'p1',
                                startDate: START + 4 * ONE_DAY,
                                dueDate: START + 4 * ONE_DAY,
                                estimatedHours: 13
                            }),
                            dailyLoad: 13
                        }
                    ]
                }],
                ['2026-01-02', {
                    dateStr: '2026-01-02',
                    timestamp: ONE_DAY,
                    plannedLoad: 11,
                    actualHours: 0,
                    actualContributions: [],
                    isActualOverload: false,
                    isPlannedOverload: true,
                    plannedContributions: [
                        {
                            task: buildTask({
                                id: 'task-early',
                                subject: 'Task Early',
                                assignedToId: 1,
                                assignedToName: 'Alice',
                                projectId: 'p1',
                                startDate: START + ONE_DAY,
                                dueDate: START + ONE_DAY,
                                estimatedHours: 11
                            }),
                            dailyLoad: 11
                        }
                    ]
                }],
                ['2026-01-04', {
                    dateStr: '2026-01-04',
                    timestamp: ONE_DAY * 3,
                    plannedLoad: 7,
                    actualHours: 0,
                    actualContributions: [],
                    isActualOverload: false,
                    isPlannedOverload: false,
                    plannedContributions: [
                        {
                            task: buildTask({
                                id: 'task-normal',
                                subject: 'Task Normal',
                                assignedToId: 1,
                                assignedToName: 'Alice',
                                projectId: 'p1',
                                startDate: START + 3 * ONE_DAY,
                                dueDate: START + 3 * ONE_DAY,
                                estimatedHours: 7
                            }),
                            dailyLoad: 7
                        }
                    ]
                }]
            ])
        }]
    ]),
    plannedOverloadedAssigneeCount: 1,
    actualOverloadedAssigneeCount: 0,
    actualOverloadedDayCount: 0,
    plannedOverloadedDayCount: 2
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
        useUIStore.setState(useUIStore.getInitialState(), true);
        useWorkloadStore.setState(useWorkloadStore.getInitialState(), true);
    });

    it('orders same-name rows by numeric assignee ID', () => {
        const data = buildWorkloadData();
        const assignee = data.assignees.get(1)!;
        data.assignees = new Map([
            [10, { ...assignee, assigneeId: 10 }],
            [2, { ...assignee, assigneeId: 2 }]
        ]);
        useWorkloadStore.setState({ workloadData: data });
        render(<WorkloadSidebar />);
        expect(screen.getAllByTestId(/^workload-sidebar-row-/).map(row => row.dataset.testid))
            .toEqual(['workload-sidebar-row-2', 'workload-sidebar-row-10']);
    });

    it('keeps assignees visible even when the gantt pane is vertically scrolled', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByTestId('workload-sidebar-peak-1')).toHaveTextContent('8.0h');
        expect(screen.getByTestId('workload-sidebar-total-1')).toHaveTextContent('16.0h');
    });

    it('renders assignee, peak, and total headers', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        expect(screen.getByText('Assignees')).toBeInTheDocument();
        expect(screen.getByTestId('workload-sidebar-header-peak')).toHaveTextContent('Peak');
        expect(screen.getByTestId('workload-sidebar-header-total')).toHaveTextContent('Total');
    });

    it('keeps the header and scroll viewport in the shared border-box geometry', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        const root = screen.getByTestId('workload-sidebar');
        const header = screen.getByTestId('workload-sidebar-header');
        const scrollViewport = screen.getByTestId('workload-sidebar-scroll');

        expect(root).toHaveStyle({ boxSizing: 'border-box' });
        expect(header).toHaveStyle({
            height: `${WORKLOAD_HEADER_HEIGHT}px`,
            flex: `0 0 ${WORKLOAD_HEADER_HEIGHT}px`,
            boxSizing: 'border-box'
        });
        expect(scrollViewport.style.minHeight).toBe('0');
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

    it('clamps and does not re-notify an externally applied scroll position', () => {
        const handleScroll = vi.fn();
        useWorkloadStore.setState({ workloadData: buildWorkloadData() });

        const { rerender } = render(<WorkloadSidebar scrollTop={0} onScroll={handleScroll} />);
        const scrollElement = screen.getByTestId('workload-sidebar-scroll');
        setScrollMetrics(scrollElement, { clientHeight: 100, scrollHeight: 201, scrollTop: 0 });

        rerender(<WorkloadSidebar scrollTop={999} onScroll={handleScroll} />);

        expect(scrollElement.scrollTop).toBe(101);
        fireEvent.scroll(scrollElement);

        expect(handleScroll).not.toHaveBeenCalled();
    });

    it('notifies the parent for a user scroll', () => {
        const handleScroll = vi.fn();
        useWorkloadStore.setState({ workloadData: buildWorkloadData() });

        render(<WorkloadSidebar onScroll={handleScroll} />);
        const scrollElement = screen.getByTestId('workload-sidebar-scroll');
        setScrollMetrics(scrollElement, { clientHeight: 100, scrollHeight: 201, scrollTop: 0 });
        scrollElement.scrollTop = 72;

        fireEvent.scroll(scrollElement);

        expect(handleScroll).toHaveBeenCalledWith(72);
    });

    it('shows an explicit empty state when no workload data matches the current filters', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: {
                assignees: new Map(),
                plannedOverloadedAssigneeCount: 0,
                actualOverloadedAssigneeCount: 0,
                actualOverloadedDayCount: 0,
                plannedOverloadedDayCount: 0
            }
        });

        render(<WorkloadSidebar />);

        expect(screen.getByText('No workload data matches the current filters.')).toBeInTheDocument();
    });

    it('renders overload as a clickable control that cycles the focused histogram bar and focuses the gantt task', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildOverloadWorkloadData()
        });
        useTaskStore.getState().setTasks([
            buildTask({
                id: 'task-early',
                subject: 'Task Early',
                assignedToId: 1,
                assignedToName: 'Alice',
                projectId: 'p1',
                startDate: START + ONE_DAY,
                dueDate: START + ONE_DAY,
                estimatedHours: 11
            }),
            buildTask({
                id: 'task-late',
                subject: 'Task Late',
                assignedToId: 1,
                assignedToName: 'Alice',
                projectId: 'p1',
                startDate: START + 4 * ONE_DAY,
                dueDate: START + 4 * ONE_DAY,
                estimatedHours: 13
            })
        ]);

        render(<WorkloadSidebar />);

        const overloadControl = screen.getByRole('button', { name: 'Focus overload histogram for Alice (Planned)' });
        expect(screen.getByTestId('overload-action-area-1')).toHaveStyle({ width: '170px', justifyContent: 'flex-end' });
        expect(screen.getByTestId('overload-cycle-count-1')).toHaveTextContent('1/2');
        fireEvent.click(overloadControl);

        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });
        expect(useWorkloadStore.getState().suppressFocusedHistogramBarVerticalScrollKey).toBe('1:2026-01-02');
        expect(useTaskStore.getState().selectedTaskId).toBe('task-early');
        expect(screen.getByTestId('overload-cycle-count-1')).toHaveTextContent('1/2');

        fireEvent.click(overloadControl);

        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-05' });
        expect(useWorkloadStore.getState().suppressFocusedHistogramBarVerticalScrollKey).toBe('1:2026-01-05');
        expect(useTaskStore.getState().selectedTaskId).toBe('task-late');
        expect(screen.getByTestId('overload-cycle-count-1')).toHaveTextContent('2/2');
    });

    it('shows a warning when overload click targets a task hidden by filters', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildOverloadWorkloadData()
        });
        useTaskStore.getState().setTasks([
            buildTask({
                id: 'task-early',
                subject: 'Task Early',
                assignedToId: 1,
                assignedToName: 'Alice',
                projectId: 'p1',
                startDate: START + ONE_DAY,
                dueDate: START + ONE_DAY,
                estimatedHours: 11
            })
        ]);
        useTaskStore.getState().setFilterText('Visible');

        render(<WorkloadSidebar />);

        fireEvent.click(screen.getByRole('button', { name: 'Focus overload histogram for Alice (Planned)' }));

        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });
        expect(useTaskStore.getState().selectedTaskId).toBeNull();
        expect(useUIStore.getState().notifications.at(-1)?.message).toBe('Selected task is hidden by the current filters.');
        expect(screen.getByTestId('overload-cycle-count-1')).toHaveTextContent('1/2');
    });

    it('does not show overload cycle count when only one overload day exists', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: {
                assignees: new Map([
                    [1, {
                        assigneeId: 1,
                        assigneeName: 'Alice',
                        plannedTotal: 8,
                        actualTotal: 0,
                        actualPeak: 0,
                        plannedPeak: 8,
                        dailyWorkloads: new Map([
                            ['2026-01-02', {
                                dateStr: '2026-01-02',
                                timestamp: ONE_DAY,
                                plannedLoad: 11,
                                actualHours: 0,
                                actualContributions: [],
                                isActualOverload: false,
                                isPlannedOverload: true,
                                plannedContributions: []
                            }]
                        ])
                    }]
                ]),
                plannedOverloadedAssigneeCount: 1,
                actualOverloadedAssigneeCount: 0,
                actualOverloadedDayCount: 0,
                plannedOverloadedDayCount: 1
            }
        });

        render(<WorkloadSidebar />);

        expect(screen.getByTestId('overload-action-area-1')).toHaveStyle({ width: '170px', justifyContent: 'flex-end' });
        expect(screen.getByTestId('overload-cycle-count-1')).toHaveStyle({ visibility: 'hidden', width: '32px' });
    });

    it('keeps peak and total in dedicated right-aligned cells when no overload is present', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData()
        });

        render(<WorkloadSidebar />);

        expect(screen.getByTestId('workload-sidebar-peak-1')).toHaveStyle({ textAlign: 'right' });
        expect(screen.getByTestId('workload-sidebar-total-1')).toHaveStyle({ textAlign: 'right' });
    });
});

describe('actual workload metrics', () => {
    it.each(['idle', 'loading', 'error', 'ready'] as const)('distinguishes actual %s from zero and shows two metric lines', actualStatus => {
        const data = buildWorkloadData();
        const assignee = data.assignees.get(1)!;
        assignee.actualPeak = 9;
        assignee.actualTotal = 12;
        assignee.dailyWorkloads.get('2026-01-01')!.isActualOverload = true;
        useWorkloadStore.setState({ ...useWorkloadStore.getInitialState(), workloadData: data, actualStatus }, true);
        render(<WorkloadSidebar />);
        const peak = screen.getByTestId('workload-sidebar-peak-1');
        const total = screen.getByTestId('workload-sidebar-total-1');
        expect(peak).toHaveTextContent('P 8.0h');
        expect(total).toHaveTextContent('P 16.0h');
        expect(peak).toHaveTextContent(actualStatus === 'ready' ? 'A 9.0h' : 'A —');
        expect(total).toHaveTextContent(actualStatus === 'ready' ? 'A 12.0h' : 'A —');
        expect(screen.queryByText('Actual overload') !== null).toBe(actualStatus === 'ready');
    });

    it('shows actual-only workers and both overload badges without adding columns', () => {
        const data = buildWorkloadData();
        const alice = data.assignees.get(1)!;
        alice.actualPeak = 10;
        alice.actualTotal = 10;
        alice.dailyWorkloads.get('2026-01-01')!.isActualOverload = true;
        alice.dailyWorkloads.get('2026-01-01')!.isPlannedOverload = true;
        data.assignees.set(2, { assigneeId: 2, assigneeName: 'John', plannedTotal: 0, plannedPeak: 0,
            actualTotal: 4, actualPeak: 4, dailyWorkloads: new Map() });
        useWorkloadStore.setState({ ...useWorkloadStore.getInitialState(), workloadData: data, actualStatus: 'ready' }, true);
        render(<WorkloadSidebar />);
        expect(screen.getByText('Plan overload')).toBeVisible();
        expect(screen.getByText('Actual overload')).toBeVisible();
        expect(screen.getByTestId('workload-sidebar-total-2')).toHaveTextContent('P 0.0hA 4.0h');
    });
});
