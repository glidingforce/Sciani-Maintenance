import type { Task } from '../types';
import { compareDaily, createdDate, workDate } from './tasks';

export type Focus = '' | 'overdue' | 'today' | 'followup' | 'waiting';
export type TaskSort = 'urgent' | 'due' | 'priority' | 'oldest';

export function matchesFocus(t: Task, focus: Focus, today: string) {
  if (!focus) return true;
  if (t.archived || t.status === 'done') return false;
  if (focus === 'overdue') return !!workDate(t) && workDate(t)! < today;
  if (focus === 'today') return workDate(t) === today;
  if (focus === 'followup') return !!t.nextFollowUp && t.nextFollowUp <= today;
  return t.status === 'waiting';
}

export function sortTasks(tasks: Task[], sort: TaskSort, today: string) {
  const urgent = compareDaily(today);
  const priority = { High: 0, Normal: 1, Low: 2 };
  return [...tasks].sort((a, b) => {
    if (sort === 'due') return (workDate(a) || '9999').localeCompare(workDate(b) || '9999') || urgent(a, b);
    if (sort === 'priority') return priority[a.priority] - priority[b.priority] || urgent(a, b);
    if (sort === 'oldest') return createdDate(a).localeCompare(createdDate(b)) || urgent(a, b);
    return urgent(a, b);
  });
}

/** Purchasing urgency includes supplier follow-ups, even without an expected delivery date. */
export function sortPurchasing(tasks: Task[], sort: TaskSort, today: string) {
  if (sort === 'priority' || sort === 'oldest') return sortTasks(tasks, sort, today);
  const date = (t: Task) => [workDate(t), t.nextFollowUp].filter((d): d is string => !!d).sort()[0] || '9999-12-31';
  const rank = (t: Task) => date(t) === '9999-12-31' ? 3 : date(t) < today ? 0 : date(t) === today ? 1 : 2;
  const compare = compareDaily(today);
  return [...tasks].sort((a, b) => (sort === 'urgent' ? rank(a) - rank(b) : date(a).localeCompare(date(b)))
    || compare({ ...a, dueDate: date(a) }, { ...b, dueDate: date(b) }));
}
