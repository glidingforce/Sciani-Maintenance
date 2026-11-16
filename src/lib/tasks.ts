import type { Contact, DateOnly, FollowUpEntry, Priority, Task } from '../types';
import { addDays, todayISO } from './dates';

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Normal: 1, Low: 2 };

export const isOpen = (t: Task) => !t.archived && t.status !== 'done';
export const isOverdue = (t: Task, today: DateOnly) => isOpen(t) && !!t.dueDate && t.dueDate < today;
export const followUpDue = (t: Task, today: DateOnly) => isOpen(t) && !!t.nextFollowUp && t.nextFollowUp <= today;

/** Daily ordering: overdue unfinished work first, then priority, then due date
 * (undated last), then oldest first so the order is stable. */
export function compareDaily(today: DateOnly) {
  return (a: Task, b: Task): number => {
    const ao = isOverdue(a, today) ? 0 : 1;
    const bo = isOverdue(b, today) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const ad = a.dueDate ?? '9999-12-31';
    const bd = b.dueDate ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  };
}

export type OwnerFilter = 'all' | 'mine' | 'others';

export function matchesOwner(t: Task, f: OwnerFilter) {
  return f === 'all' || (f === 'mine' ? t.owner === 'me' : t.owner === 'other');
}

/** Short-term open tasks for the Today list, in daily order. */
export function priorityList(tasks: Task[], today: DateOnly, filter: OwnerFilter = 'all'): Task[] {
  return tasks
    .filter((t) => t.kind === 'task' && isOpen(t) && matchesOwner(t, filter))
    .sort(compareDaily(today));
}

export interface DailyCounts {
  high: number;
  dueToday: number;
  overdue: number;
  withOthers: number;
}

/** Counts come straight from saved records and completion state. */
export function dailyCounts(tasks: Task[], today: DateOnly): DailyCounts {
  const open = tasks.filter((t) => t.kind === 'task' && isOpen(t));
  return {
    high: open.filter((t) => t.priority === 'High').length,
    dueToday: open.filter((t) => t.dueDate === today).length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    withOthers: open.filter((t) => t.owner === 'other').length,
  };
}

/** Open work (tasks and projects) with a follow-up date, earliest first. */
export function followUps(tasks: Task[], today: DateOnly, horizonDays = 7): Task[] {
  const limit = addDays(today, horizonDays);
  return tasks
    .filter((t) => isOpen(t) && t.nextFollowUp && t.nextFollowUp <= limit)
    .sort((a, b) => (a.nextFollowUp! < b.nextFollowUp! ? -1 : a.nextFollowUp! > b.nextFollowUp! ? 1 : compareDaily(today)(a, b)));
}

export function longTerm(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.kind === 'project' && isOpen(t))
    .sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      return (a.milestoneDate ?? '9999') < (b.milestoneDate ?? '9999') ? -1 : 1;
    });
}

export function newTask(partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: uid(),
    kind: 'task',
    title: '',
    priority: 'Normal',
    status: 'todo',
    owner: 'me',
    archived: false,
    createdAt: now,
    updatedAt: now,
    followUps: [],
    ...partial,
  };
}

export function newContact(partial: Partial<Contact> = {}): Contact {
  const now = new Date().toISOString();
  return { id: uid(), name: '', type: 'Contractor', createdAt: now, updatedAt: now, ...partial };
}

const touch = (t: Task): Task => ({ ...t, updatedAt: new Date().toISOString() });

export function complete(t: Task): Task {
  return touch({ ...t, status: 'done', completedAt: new Date().toISOString() });
}

export function reopen(t: Task): Task {
  return touch({ ...t, status: 'todo', completedAt: undefined });
}

export function setArchived(t: Task, archived: boolean): Task {
  return touch({ ...t, archived });
}

/** Records a follow-up. Deliberately does not change status or completion. */
export function logFollowUp(t: Task, entry: { date: DateOnly; note: string; next?: DateOnly }): Task {
  const log: FollowUpEntry = { id: uid(), date: entry.date, note: entry.note.trim(), loggedAt: new Date().toISOString() };
  return touch({ ...t, followUps: [...t.followUps, log], nextFollowUp: entry.next || undefined });
}

export function searchTasks(tasks: Task[], query: string, contacts: Contact[]): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return tasks.filter((t) => {
    const c = t.contactId ? byId.get(t.contactId) : undefined;
    return [t.title, t.area, t.requester, t.assignee, t.notes, t.nextAction, c?.name, c?.company]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(q));
  });
}

/** Who-is-doing-it text for a row. */
export function ownerLabel(t: Task, contacts: Contact[]): string {
  if (t.owner === 'me') return 'Me';
  const c = contacts.find((x) => x.id === t.contactId);
  return t.assignee || c?.company || c?.name || 'Someone else';
}

// ---------- Today view helpers ----------

export interface TodayGroups {
  overdue: Task[];
  today: Task[];
  soon: Task[]; // due in the next 7 days
  later: Task[]; // due later, or no date
}

/** Splits open short-term work into the four groups shown on the Today page. */
export function groupForToday(tasks: Task[], today: DateOnly, filter: OwnerFilter = 'all'): TodayGroups {
  const week = addDays(today, 7);
  const g: TodayGroups = { overdue: [], today: [], soon: [], later: [] };
  for (const t of priorityList(tasks, today, filter)) {
    if (isOverdue(t, today)) g.overdue.push(t);
    else if (t.dueDate === today) g.today.push(t);
    else if (t.dueDate && t.dueDate <= week) g.soon.push(t);
    else g.later.push(t);
  }
  return g;
}

/** Tasks completed today (Israel date), newest first, so they can be reopened quickly. */
export function doneToday(tasks: Task[], today: DateOnly): Task[] {
  return tasks
    .filter((t) => t.kind === 'task' && t.status === 'done' && !t.archived && t.completedAt && todayISO(new Date(t.completedAt)) === today)
    .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1));
}

export type QuickAction = 'start' | 'waiting' | 'todo' | 'tomorrow' | 'nextweek' | 'high' | 'normal';

export function applyQuick(t: Task, action: QuickAction, today: DateOnly): Task {
  const base = { ...t, updatedAt: new Date().toISOString() };
  switch (action) {
    case 'start':
      return { ...base, status: 'in_progress' };
    case 'waiting':
      return { ...base, status: 'waiting' };
    case 'todo':
      return { ...base, status: 'todo' };
    case 'tomorrow':
      return { ...base, dueDate: addDays(today, 1) };
    case 'nextweek':
      return { ...base, dueDate: addDays(today, 7) };
    case 'high':
      return { ...base, priority: 'High' };
    case 'normal':
      return { ...base, priority: 'Normal' };
  }
}

/** One plain-language line for the morning. */
export function morningSummary(c: DailyCounts, followUpsDue: number): string {
  const parts: string[] = [];
  if (c.overdue) parts.push(`${c.overdue} overdue`);
  if (c.dueToday) parts.push(`${c.dueToday} due today`);
  if (followUpsDue) parts.push(`${followUpsDue} follow-up${followUpsDue > 1 ? 's' : ''} to make`);
  if (!parts.length) return 'Nothing due today. A good day for long-term work.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `You have ${list}.`;
}
