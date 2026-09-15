import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { afterEach, vi } from 'vitest';

setupTestBed({ zoneless: true });

// port-fixture's flush() waits on a real setTimeout, so a fake clock surviving one spec file would
// deadlock every port spec after it, with a hang and no message.
afterEach((): void => {
  vi.useRealTimers();
});
