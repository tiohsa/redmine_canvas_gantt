import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const timerColumnPreferences = {
  visibleColumns: ['timer', 'subject', 'status'],
  columnSettings: [
    { key: 'timer', visible: true },
    { key: 'subject', visible: true },
    { key: 'status', visible: true },
  ],
};

test('serializes simultaneous timer starts and synchronizes the winner across tabs', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await Promise.all([
    setupMockApp(pageA, { preferences: timerColumnPreferences }),
    setupMockApp(pageB, { preferences: timerColumnPreferences }),
  ]);
  await Promise.all([waitForInitialRender(pageA), waitForInitialRender(pageB)]);

  await Promise.all([
    pageA.getByTestId('task-timer-start-101').dispatchEvent('click'),
    pageB.getByTestId('task-timer-start-102').dispatchEvent('click'),
  ]);
  await Promise.all([
    expect(pageA.getByTestId('timer-start-modal')).toBeVisible(),
    expect(pageB.getByTestId('timer-start-modal')).toBeVisible(),
  ]);

  await Promise.all([
    pageA.getByTestId('timer-start-confirm-button').click(),
    pageB.getByTestId('timer-start-confirm-button').click(),
  ]);

  await expect.poll(async () => pageA.evaluate(() => (
    Object.keys(localStorage).filter(key => key.startsWith('redmine_canvas_gantt_timer_session:')).length
  ))).toBe(1);

  const canonicalFromA = await pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'));
    return key ? localStorage.getItem(key) : null;
  });
  const canonicalFromB = await pageB.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'));
    return key ? localStorage.getItem(key) : null;
  });

  expect(canonicalFromA).not.toBeNull();
  expect(canonicalFromB).toBe(canonicalFromA);
  const canonical = JSON.parse(canonicalFromA!) as { issueId: number | string; revision: number; deadlineAt: number };
  expect(['101', '102']).toContain(String(canonical.issueId));
  expect(canonical.revision).toBe(1);
  const initialDeadline = canonical.deadlineAt;
  const initialRevision = canonical.revision;

  await Promise.all([
    expect(pageA.getByTestId('global-timer')).toBeVisible(),
    expect(pageB.getByTestId('global-timer')).toBeVisible(),
  ]);
  await expect(pageA.getByTestId('global-timer-subject')).toHaveText(await pageB.getByTestId('global-timer-subject').innerText());

  await Promise.all([
    pageA.getByTestId('global-timer-quick-extend').click(),
    pageB.getByTestId('global-timer-quick-extend').click(),
  ]);

  await expect.poll(async () => pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'));
    if (!key) return null;
    const session = JSON.parse(localStorage.getItem(key)!) as { deadlineAt: number; revision: number };
    return { deadlineAt: session.deadlineAt, revision: session.revision };
  })).toMatchObject({
    deadlineAt: expect.any(Number),
    revision: expect.any(Number),
  });

  const afterConcurrentExtend = await pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    return JSON.parse(localStorage.getItem(key)!) as { deadlineAt: number; revision: number };
  });
  expect(afterConcurrentExtend.deadlineAt).toBe(initialDeadline + 30 * 60 * 1000);
  expect(afterConcurrentExtend.revision).toBe(initialRevision + 2);

  await pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    const session = JSON.parse(localStorage.getItem(key)!) as {
      revision: number;
      segments: Array<{ startedAt: number; stoppedAt?: number }>;
      notifiedDeadlineAt?: number;
      notifiedType?: string;
      [key: string]: unknown;
    };
    const deadlineAt = Date.now() + 250;
    const lastSegment = session.segments.at(-1)!;
    lastSegment.startedAt = deadlineAt - 5 * 60 * 1000;
    delete lastSegment.stoppedAt;
    delete session.notifiedDeadlineAt;
    delete session.notifiedType;
    localStorage.setItem(key, JSON.stringify({
      ...session,
      state: 'running',
      autoStop: false,
      deadlineAt,
      revision: session.revision + 1,
      updatedAt: Date.now(),
    }));
  });

  await expect.poll(async () => {
    const counts = await Promise.all([
      pageA.getByText(/5 minutes elapsed\. Timer continues\./).count(),
      pageB.getByText(/5 minutes elapsed\. Timer continues\./).count(),
    ]);
    return counts[0] + counts[1];
  }, { timeout: 2_500 }).toBe(1);

  const notificationClaim = await pageB.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    const session = JSON.parse(localStorage.getItem(key)!) as { deadlineAt: number; notifiedDeadlineAt?: number; notifiedType?: string };
    return {
      claimed: session.notifiedDeadlineAt === session.deadlineAt,
      type: session.notifiedType,
    };
  });
  expect(notificationClaim).toEqual({ claimed: true, type: 'running_expired' });

  await Promise.all([pageA.close(), pageB.close()]);
});

test('serializes simultaneous starts through the IndexedDB fallback when Web Locks is unavailable', async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await Promise.all([
    setupMockApp(pageA, { preferences: timerColumnPreferences }),
    setupMockApp(pageB, { preferences: timerColumnPreferences }),
  ]);
  await Promise.all([waitForInitialRender(pageA), waitForInitialRender(pageB)]);

  await Promise.all([
    pageA.getByTestId('task-timer-start-101').dispatchEvent('click'),
    pageB.getByTestId('task-timer-start-102').dispatchEvent('click'),
  ]);
  await Promise.all([
    pageA.getByTestId('timer-start-confirm-button').click(),
    pageB.getByTestId('timer-start-confirm-button').click(),
  ]);

  await expect.poll(async () => pageA.evaluate(() => (
    Object.keys(localStorage).filter(key => key.startsWith('redmine_canvas_gantt_timer_session:')).length
  ))).toBe(1);
  const sessions = await Promise.all([pageA, pageB].map(page => page.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'));
    return key ? localStorage.getItem(key) : null;
  })));
  expect(sessions[0]).not.toBeNull();
  expect(sessions[1]).toBe(sessions[0]);
  expect(JSON.parse(sessions[0]!).revision).toBe(1);

  const initialSession = JSON.parse(sessions[0]!) as { deadlineAt: number; revision: number };
  await Promise.all([
    pageA.getByTestId('global-timer-quick-extend').click(),
    pageB.getByTestId('global-timer-quick-extend').click(),
  ]);
  await expect.poll(async () => pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'));
    if (!key) return null;
    const session = JSON.parse(localStorage.getItem(key)!) as { deadlineAt: number; revision: number };
    return { deadlineAt: session.deadlineAt, revision: session.revision };
  })).toEqual({
    deadlineAt: initialSession.deadlineAt + 30 * 60 * 1000,
    revision: initialSession.revision + 2,
  });
});

test('preserves recording reservations on reload regardless of owner or phase', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await Promise.all([
    setupMockApp(pageA, { preferences: timerColumnPreferences }),
    setupMockApp(pageB, { preferences: timerColumnPreferences }),
  ]);
  await Promise.all([waitForInitialRender(pageA), waitForInitialRender(pageB)]);

  await pageA.evaluate(() => sessionStorage.setItem('redmine_canvas_gantt_timer_tab_id', 'owner-tab'));
  await pageB.evaluate(() => sessionStorage.setItem('redmine_canvas_gantt_timer_tab_id', 'other-tab'));
  const ownerTabId = await pageA.evaluate(() => sessionStorage.getItem('redmine_canvas_gantt_timer_tab_id'));
  const otherTabId = await pageB.evaluate(() => sessionStorage.getItem('redmine_canvas_gantt_timer_tab_id'));
  expect(ownerTabId).toBeTruthy();
  expect(otherTabId).toBeTruthy();
  expect(otherTabId).not.toBe(ownerTabId);

  const writePendingSession = async (page: typeof pageA, phase: 'editing' | 'submitting', owner: string) => {
    await page.evaluate(({ phase: attemptPhase, ownerTabId: attemptOwner }) => {
      const key = `redmine_canvas_gantt_timer_session:${encodeURIComponent(window.location.origin)}:user:1`;
      const now = Date.now();
      localStorage.setItem(key, JSON.stringify({
        version: 4,
        sessionId: `ownership-${attemptPhase}-${attemptOwner}`,
        revision: 1,
        issueId: 101,
        subject: 'Task 101',
        autoStop: false,
        userId: 1,
        state: 'stopped_pending_record',
        recordingAttempt: {
          id: `attempt-${attemptPhase}`,
          ownerTabId: attemptOwner,
          openedAt: now - 30 * 60 * 1000,
          phase: attemptPhase,
        },
        segments: [{ startedAt: now - 30 * 60 * 1000, stoppedAt: now }],
        createdAt: now - 30 * 60 * 1000,
        updatedAt: now,
      }));
    }, { phase, ownerTabId: owner });
  };

  await writePendingSession(pageA, 'editing', ownerTabId!);
  await pageA.reload();
  await pageA.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
  await expect.poll(() => pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    return { phase: session.recordingAttempt.phase, ownerTabId: session.recordingAttempt.ownerTabId };
  })).toEqual({ phase: 'editing', ownerTabId });

  await writePendingSession(pageA, 'submitting', ownerTabId!);
  await pageA.reload();
  await pageA.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
  await expect.poll(() => pageA.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    return { phase: session.recordingAttempt.phase, ownerTabId: session.recordingAttempt.ownerTabId };
  })).toEqual({ phase: 'submitting', ownerTabId });

  await writePendingSession(pageA, 'editing', ownerTabId!);
  await pageB.reload();
  await pageB.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
  await expect.poll(() => pageB.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    return JSON.parse(localStorage.getItem(key)!).recordingAttempt.phase;
  })).toBe('editing');

  await writePendingSession(pageA, 'submitting', ownerTabId!);
  await pageB.reload();
  await pageB.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
  await expect.poll(() => pageB.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    return { phase: session.recordingAttempt.phase, ownerTabId: session.recordingAttempt.ownerTabId };
  })).toEqual({ phase: 'submitting', ownerTabId });
});
