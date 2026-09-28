import { describe, expect, it } from 'vitest';
import { blankTask } from '@/lib/domain/mutations';
import { countTasks, delayDays, isBlocked, isDueSoon, isOverdue, lateCompletionDays, needsDecision, progressOf } from '@/lib/domain/metrics';
import type { Task } from '@/lib/domain/types';

const meta = { user: 't', now: new Date('2026-09-28T10:00:00') };
const T = (p: Partial<Task>) => blankTask({ Task_ID: p.Task_ID ?? 'X-HR-001', Store_ID: 'X', Area: 'HR', Task_Title: 't', ...p }, meta);
const today = '2026-09-28';

describe('derived metrics', () => {
  it('delay: only for open tasks past due date', () => {
    expect(delayDays(T({ Due_Date: '2026-09-15', Status: 'In Progress' }), today)).toBe(13);
    expect(delayDays(T({ Due_Date: '2026-09-15', Status: 'Completed' }), today)).toBeNull();
    expect(delayDays(T({ Due_Date: '2026-09-15', Status: 'N/A' }), today)).toBeNull();
    expect(delayDays(T({ Due_Date: '2026-10-15', Status: 'In Progress' }), today)).toBeNull();
    expect(delayDays(T({ Due_Date: today, Status: 'In Progress' }), today)).toBeNull();
  });

  it('late completion is retained for completed tasks', () => {
    expect(lateCompletionDays(T({ Due_Date: '2026-09-10', Status: 'Completed', Completed_Date: '2026-09-13' }))).toBe(3);
    expect(lateCompletionDays(T({ Due_Date: '2026-09-10', Status: 'Completed', Completed_Date: '2026-09-09' }))).toBeNull();
  });

  it('overdue / due soon / blocked / decision detection', () => {
    expect(isOverdue(T({ Due_Date: '2026-09-27' }), today)).toBe(true);
    expect(isDueSoon(T({ Due_Date: '2026-10-12' }), today, 14)).toBe(true);
    expect(isDueSoon(T({ Due_Date: '2026-10-13' }), today, 14)).toBe(false);
    expect(isDueSoon(T({ Due_Date: '2026-10-01', Status: 'Completed' }), today, 14)).toBe(false);
    expect(isBlocked(T({ Status: 'Blocked' }))).toBe(true);
    expect(isBlocked(T({ Status: 'In Progress', Blocker: 'Waiting for landlord' }))).toBe(true);
    expect(isBlocked(T({ Status: 'In Progress', Blocker: 'FALSE' }))).toBe(false);
    expect(isBlocked(T({ Status: 'Completed', Blocker: 'old blocker' }))).toBe(false);
    expect(needsDecision(T({ Decision_Required: 'TRUE' }))).toBe(true);
    expect(needsDecision(T({ Decision_Required: '' }))).toBe(false);
  });

  it('progress: simple vs weighted, N/A excluded, On Hold not completed, Completed = 100', () => {
    const tasks = [
      T({ Task_ID: 'a', Progress_Percentage: 50, Task_Weight: 1 }),
      T({ Task_ID: 'b', Status: 'Completed', Progress_Percentage: 60, Task_Weight: 3 }),
      T({ Task_ID: 'c', Status: 'On Hold', Progress_Percentage: 20, Task_Weight: 1 }),
      T({ Task_ID: 'd', Status: 'N/A', Progress_Percentage: 0, Task_Weight: 10 }),
    ];
    expect(progressOf(tasks, 'simple')).toBe(Math.round((50 + 100 + 20) / 3));
    expect(progressOf(tasks, 'weighted')).toBe(Math.round((50 + 300 + 20) / 5));
    expect(progressOf([], 'simple')).toBe(0);
  });

  it('counts ignore archived tasks', () => {
    const c = countTasks([T({ Task_ID: 'a', Due_Date: '2026-09-01' }), T({ Task_ID: 'b', Due_Date: '2026-09-01', Archived: true })], today, 14);
    expect(c.total).toBe(1);
    expect(c.overdue).toBe(1);
  });
});
