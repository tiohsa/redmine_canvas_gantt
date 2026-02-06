import { test } from '@playwright/test';

// NOTE:
// TaskDetailPanel component exists but is intentionally not mounted in GanttContainer.
// These scenarios stay in the plan and can be re-enabled when panel UI is restored.
test.skip('displays task details', async () => {});
test.skip('edits task subject', async () => {});
test.skip('edits start date', async () => {});
test.skip('edits due date', async () => {});
