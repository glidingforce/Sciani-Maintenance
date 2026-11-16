import type { Contact, DateOnly, FollowUpEntry, Priority, Task } from '../types';
import { addDays, daysBetween, relativeDate, shortDate, todayISO } from './dates';
import { getMyName } from './settings';

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
    return [t.title, t.area, t.room, t.equipmentName, t.equipmentNumber, t.requester, t.assignee, t.notes, t.nextAction, t.waitingFor, c?.name, c?.company]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(q));
  });
}

/** Who-is-doing-it text for a row. */
export function ownerLabel(t: Task, contacts: Contact[]): string {
  if (t.owner === 'me') return getMyName();
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

export type QuickAction = 'start' | 'waiting' | 'todo' | 'done' | 'tomorrow' | 'nextweek' | 'high' | 'normal';

export function applyQuick(t: Task, action: QuickAction, today: DateOnly): Task {
  const base = { ...t, updatedAt: new Date().toISOString() };
  switch (action) {
    case 'start':
      return { ...base, status: 'in_progress' };
    case 'waiting':
      return { ...base, status: 'waiting' };
    case 'todo':
      return { ...base, status: 'todo' };
    case 'done':
      return complete(t);
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

// ---------- Daily list (one entry per task) ----------

export type DailyGroup = 'attention' | 'coming' | 'unscheduled' | 'later' | 'longterm';
export type ReasonTone = 'urgent' | 'today' | 'soon' | 'info';

export interface Reason {
  label: string;
  tone: ReasonTone;
}

export interface DailyItem {
  task: Task;
  group: DailyGroup;
  reasons: Reason[];
  /** Earliest relevant date, used for ordering inside a group. */
  sortDate: string;
}

/** The work deadline: due date, or for long-term work its milestone. */
export const workDate = (t: Task): DateOnly | undefined => t.dueDate ?? (t.kind === 'project' ? t.milestoneDate : undefined);

function soonLabel(prefix: string, date: DateOnly, today: DateOnly) {
  const rel = relativeDate(date, today);
  return rel === 'Tomorrow' ? `${prefix} tomorrow` : `${prefix} ${rel}`;
}

/**
 * Decides the single group a task belongs to, and every reason it is there.
 * Most urgent group wins: attention > coming up > (later | not scheduled | long-term).
 */
export function classify(t: Task, today: DateOnly): DailyItem {
  const week = addDays(today, 7);
  const reasons: Reason[] = [];
  const work = workDate(t);
  const fu = t.nextFollowUp;
  const workWord = t.kind === 'project' ? 'Milestone' : 'Due';

  let attention = false;
  let coming = false;
  if (work) {
    if (work < today) {
      reasons.push({ label: `Overdue · ${shortDate(work, today)}`, tone: 'urgent' });
      attention = true;
    } else if (work === today) {
      reasons.push({ label: `${workWord} today`, tone: 'today' });
      attention = true;
    } else if (work <= week) {
      reasons.push({ label: soonLabel(workWord, work, today), tone: 'soon' });
      coming = true;
    } else {
      reasons.push({ label: `${workWord} ${shortDate(work, today)}`, tone: 'info' });
    }
  }
  if (fu) {
    if (fu < today) {
      reasons.push({ label: `Follow-up overdue · ${shortDate(fu, today)}`, tone: 'urgent' });
      attention = true;
    } else if (fu === today) {
      reasons.push({ label: 'Follow-up due', tone: 'today' });
      attention = true;
    } else if (fu <= week) {
      reasons.push({ label: soonLabel('Follow-up', fu, today), tone: 'soon' });
      coming = true;
    } else {
      reasons.push({ label: `Follow-up ${shortDate(fu, today)}`, tone: 'info' });
    }
  }
  if (t.blocker) reasons.push({ label: 'Blocked', tone: 'urgent' });

  const group: DailyGroup = attention
    ? 'attention'
    : coming
      ? 'coming'
      : t.kind === 'project'
        ? 'longterm'
        : work || fu
          ? 'later'
          : 'unscheduled';
  const sortDate = [work, fu].filter(Boolean).sort()[0] ?? '9999-12-31';
  return { task: t, group, reasons, sortDate };
}

const URGENCY: Record<ReasonTone, number> = { urgent: 0, today: 1, soon: 2, info: 3 };

/** Builds the daily list: every open task exactly once. */
export function dailyList(tasks: Task[], today: DateOnly, filter: OwnerFilter = 'all'): Record<DailyGroup, DailyItem[]> {
  const out: Record<DailyGroup, DailyItem[]> = { attention: [], coming: [], unscheduled: [], later: [], longterm: [] };
  for (const t of tasks) {
    if (!isOpen(t) || !matchesOwner(t, filter)) continue;
    const item = classify(t, today);
    out[item.group].push(item);
  }
  const rank = (i: DailyItem) => Math.min(...i.reasons.map((r) => URGENCY[r.tone]), 9);
  for (const list of Object.values(out)) {
    list.sort((a, b) => {
      const u = rank(a) - rank(b);
      if (u) return u;
      const p = PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
      if (p) return p;
      if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? -1 : 1;
      return a.task.createdAt < b.task.createdAt ? -1 : 1;
    });
  }
  return out;
}

/** "Waiting for cooling contractor · a quotation", from recorded fields only (nothing inferred). */
export function waitingText(t: Task): string | undefined {
  if (t.status !== 'waiting') return undefined;
  const parts = [t.waitingFor ? `Waiting for ${t.waitingFor}` : 'Waiting', t.waitingWhat].filter(Boolean);
  return parts.join(' · ');
}

/** True when the record lacks something that would make it actionable. */
export function needsDetails(t: Task): string | undefined {
  if (t.status === 'waiting' && !t.waitingFor) return 'Add who you are waiting for';
  if (t.status === 'waiting' && !t.nextFollowUp) return 'Add a follow-up date';
  if (!t.nextAction && (t.kind === 'project' || t.status === 'waiting')) return 'Add a next action';
  return undefined;
}

// ---------- Equipment and age ----------

/** "Huber chiller · CH-02 · Room 104" from whichever parts are recorded. */
export function equipmentText(t: Task): string {
  const room = t.room ? (/^\d/.test(t.room) ? `Room ${t.room}` : t.room) : '';
  return [t.equipmentName, t.equipmentNumber, room].filter(Boolean).join(' · ');
}

/** Israel date the task was created. */
export const createdDate = (t: Task): DateOnly => todayISO(new Date(t.createdAt));
export const closedDate = (t: Task): DateOnly | undefined => (t.completedAt ? todayISO(new Date(t.completedAt)) : undefined);

/** Days the task has been open: until today, or until it was completed. */
export function daysOpen(t: Task, today: DateOnly): number {
  const end = t.status === 'done' ? (closedDate(t) ?? today) : today;
  return Math.max(0, daysBetween(createdDate(t), end));
}

export const daysLabel = (n: number) => (n === 0 ? 'opened today' : n === 1 ? '1 day open' : `${n} days open`);

/** Tasks completed within the last `days` calendar days including today (Israel dates), newest first. */
export function closedWithin(tasks: Task[], today: DateOnly, days = 7): Task[] {
  const from = addDays(today, -(days - 1));
  return tasks
    .filter((t) => t.status === 'done' && t.completedAt && closedDate(t)! >= from && closedDate(t)! <= today)
    .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1));
}
