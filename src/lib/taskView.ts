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
