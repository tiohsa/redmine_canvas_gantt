import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { A11yLayer } from './A11yLayer';
import { useTaskStore } from '../stores/TaskStore';
import { resetCanvasGanttTestState } from '../test/testSetup';
import type { Task } from '../types';

const task = (id: number | string): Task => ({
    id: String(id),
    subject: `Task ${id}`,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 1,
    editable: true,
    rowIndex: Number(id) - 1,
    hasChildren: false
});

const tasks = (count: number) => Array.from({ length: count }, (_, index) => task(index + 1));

const setVisibleTasks = (visibleTasks: Task[], selectedTaskId: string | null = null) => {
    useTaskStore.setState({
        tasks: visibleTasks,
        allTasks: visibleTasks,
        rowCount: visibleTasks.length,
        selectedTaskId
    });
};

const list = () => screen.getByRole('list', { name: 'Gantt Chart Task List' });
const renderedTaskIds = () => within(list()).getAllByRole('listitem').map((item) => item.getAttribute('data-id'));

describe('A11yLayer', () => {
    beforeEach(() => resetCanvasGanttTestState());

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('keeps a sorted, bounded window for large task lists and reports each task position', () => {
        const allTasks = tasks(10_000);
        setVisibleTasks(allTasks, '5000');

        render(<A11yLayer />);

        const items = within(list()).getAllByRole('listitem');
        const ids = items.map((item) => Number(item.getAttribute('data-id')));
        expect(items.length).toBeLessThanOrEqual(55);
        expect(ids).toEqual([...ids].sort((left, right) => left - right));
        expect(ids).toContain(1);
        expect(ids).toContain(10_000);
        expect(ids).toContain(5000);
        expect(items.find((item) => item.getAttribute('data-id') === '5000')).toHaveAttribute('aria-posinset', '5000');
        expect(items.find((item) => item.getAttribute('data-id') === '5000')).toHaveAttribute('aria-setsize', '10000');
    });

    it('keeps an out-of-window selected task mounted and focuses it', async () => {
        setVisibleTasks(tasks(200), '180');

        render(<A11yLayer />);

        const selected = await within(list()).findByRole('listitem', { name: /Task 180/ });
        await waitFor(() => expect(selected).toHaveFocus());
        expect(selected).toHaveAttribute('aria-posinset', '180');
        expect(selected).toHaveAttribute('aria-setsize', '200');
    });

    it('moves forward and backward across rendered window boundaries with Tab', async () => {
        setVisibleTasks(tasks(120));
        render(<A11yLayer />);

        const firstWindowIds = renderedTaskIds();
        const edgeId = Math.max(...firstWindowIds.map(Number).filter((id) => id !== 120)).toString();
        const lastInWindow = list().querySelector<HTMLElement>(`[data-id="${edgeId}"]`)!;
        lastInWindow.focus();
        const forward = fireEvent.keyDown(lastInWindow, { key: 'Tab' });

        expect(forward).toBe(false);
        const nextId = String(Number(edgeId) + 1);
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', nextId));
        expect(useTaskStore.getState().selectedTaskId).toBe(nextId);
        expect(renderedTaskIds()).not.toEqual(firstWindowIds);
        expect(renderedTaskIds()).toContain(nextId);

        const firstInNextWindow = list().querySelector<HTMLElement>(`[data-id="${nextId}"]`)!;
        const backward = fireEvent.keyDown(firstInNextWindow, { key: 'Tab', shiftKey: true });
        expect(backward).toBe(false);
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', edgeId));
        expect(useTaskStore.getState().selectedTaskId).toBe(edgeId);
    });

    it('leaves Tab and Shift+Tab unhandled at the first and last task', () => {
        setVisibleTasks(tasks(120));
        render(<A11yLayer />);

        const first = list().querySelector<HTMLElement>('[data-id="1"]')!;
        first.focus();
        expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(true);

        const last = list().querySelector<HTMLElement>('[data-id="120"]')!;
        last.focus();
        expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);
    });

    it('recovers the focused ordinal after reordering and filtering removes its task', async () => {
        setVisibleTasks(tasks(8));
        render(<A11yLayer />);

        const focusedTask = within(list()).getByRole('listitem', { name: /Task 5/ });
        focusedTask.focus();
        act(() => setVisibleTasks([task(1), task(2), task(3), task(4), task(6), task(5), task(7), task(8)]));
        expect(within(list()).getByRole('listitem', { name: /Task 5/ })).toHaveFocus();

        act(() => setVisibleTasks([task(8), task(7), task(6), task(4), task(3), task(2), task(1)]));

        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', '2'));
        expect(useTaskStore.getState().selectedTaskId).toBe('2');
    });

    it('mounts an out-of-window ordinal recovery target before focusing it', async () => {
        setVisibleTasks(tasks(300), '180');
        render(<A11yLayer />);
        expect(list().querySelector('[data-id="180"]')).toHaveFocus();

        act(() => setVisibleTasks(tasks(300).filter(item => item.id !== '180')));

        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', '181'));
        expect(useTaskStore.getState().selectedTaskId).toBe('181');
        expect(within(list()).getAllByRole('listitem').length).toBeLessThanOrEqual(55);
    });

    it('shows an empty list when there are no tasks', () => {
        setVisibleTasks([]);

        render(<A11yLayer />);

        expect(within(list()).queryAllByRole('listitem')).toHaveLength(0);
    });

    it('clears focus recovery when the task list becomes empty', () => {
        setVisibleTasks(tasks(100));
        render(<><button type="button">Outside control</button><A11yLayer /></>);
        act(() => within(list()).getByRole('listitem', { name: /Task 3\./ }).focus());
        act(() => setVisibleTasks([]));
        expect(within(list()).queryAllByRole('listitem')).toHaveLength(0);

        const outside = screen.getByRole('button', { name: 'Outside control' });
        act(() => outside.focus());
        act(() => setVisibleTasks(tasks(100)));
        expect(outside).toHaveFocus();
        expect(within(list()).getAllByRole('listitem').length).toBeLessThanOrEqual(55);
    });

    it('retains the focused task when viewport scrolling changes the virtual window', async () => {
        setVisibleTasks(tasks(200));
        render(<A11yLayer />);

        const focusedTask = within(list()).getByRole('listitem', { name: /Task 3/ });
        focusedTask.focus();
        act(() => {
            useTaskStore.setState({ viewport: { ...useTaskStore.getState().viewport, scrollY: 5000 } });
        });

        await waitFor(() => expect(within(list()).getByRole('listitem', { name: /Task 3/ })).toHaveFocus());
        expect(renderedTaskIds()).toContain('3');
        expect(renderedTaskIds()).toContain('200');
    });

    it('does not steal focus from an external control when task data changes', () => {
        setVisibleTasks(tasks(3));
        render(
            <>
                <button type="button">Outside control</button>
                <A11yLayer />
            </>
        );

        const outsideControl = screen.getByRole('button', { name: 'Outside control' });
        outsideControl.focus();
        act(() => setVisibleTasks(tasks(12)));

        expect(outsideControl).toHaveFocus();
    });

    it('follows the viewport without taking focus from an external control', () => {
        setVisibleTasks(tasks(300));
        const viewport = useTaskStore.getState().viewport;
        useTaskStore.setState({ viewport: { ...viewport, scrollY: 100 * viewport.rowHeight } });
        render(<><button type="button">Outside control</button><A11yLayer /></>);
        expect(renderedTaskIds()).toContain('101');
        expect(renderedTaskIds()).not.toContain('26');
        const outside = screen.getByRole('button', { name: 'Outside control' });
        act(() => outside.focus());
        act(() => useTaskStore.setState({ viewport: { ...viewport, scrollY: 200 * viewport.rowHeight } }));
        expect(outside).toHaveFocus();
        expect(renderedTaskIds()).toContain('201');
        expect(renderedTaskIds()).not.toContain('101');
    });

    it('does not recover a removed task after focus has left the list', () => {
        setVisibleTasks(tasks(100));
        render(<><button type="button">Outside control</button><A11yLayer /></>);
        act(() => within(list()).getByRole('listitem', { name: /Task 3\./ }).focus());
        const outside = screen.getByRole('button', { name: 'Outside control' });
        act(() => outside.focus());
        act(() => useTaskStore.setState({ tasks: tasks(100).filter(item => item.id !== '3') }));
        expect(outside).toHaveFocus();
        expect(useTaskStore.getState().selectedTaskId).toBe('3');
    });

});
