import type { Contact, DateOnly, Priority, Status, Task } from '../types';
import { CATEGORY_LABEL, STATUS_LABEL } from '../types';
import { closedDate, closedWithin, compareDaily, createdDate, daysOpen, equipmentText, isOpen, isOverdue, ownerLabel, workDate } from './tasks';
import { addDays } from './dates';
import { categoryLabel, isPurchasing, matchesCategory, outcomeLabel, type CategoryFilter } from './categories';

export type StatusFilter = 'all' | Status | 'blocked' | 'longterm';

export interface ReportFilters {
  category?: CategoryFilter;
  area: string; // '' = all
  responsible: string; // '' = all
  priority: '' | Priority;
  status: StatusFilter;
  /** Optional: only work due on or before this date. Excludes tasks without a due date. */
  dueBy: DateOnly | '';
}

export const DEFAULT_FILTERS: ReportFilters = { area: '', responsible: '', priority: '', status: 'all', dueBy: '' };

export interface ReportRow {
  id: string;
  title: string;
  category: string;
  reference: string;
  area: string;
  equipment: string; // name · number · room
  opened: DateOnly;
  daysOpen: number;
  responsible: string;
  status: string;
  priority: Priority;
  due?: DateOnly;
  overdue: boolean;
  nextAction: string;
  followUp?: DateOnly;
  blocker: string;
  managementAction: string;
}

export interface ReportCounts {
  open: number;
  overdue: number;
  high: number;
  waiting: number;
  blocked: number;
}

/** Same responsible-party wording as the app; contact phone numbers and e-mails are never included. */
export const responsibleOf = (t: Task, contacts: Contact[]) => ownerLabel(t, contacts);

export function reportOptions(tasks: Task[], contacts: Contact[]) {
  const open = tasks.filter(isOpen);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    areas: uniq(open.flatMap((t) => [t.area ?? '', t.room ?? ''])),
    responsible: uniq(open.map((t) => responsibleOf(t, contacts))),
  };
}

/** Unfinished work only (done and archived excluded). Default filters keep waiting and unscheduled tasks. */
export function selectReportTasks(tasks: Task[], contacts: Contact[], f: ReportFilters, today: DateOnly): Task[] {
  return tasks
    .filter(isOpen)
    .filter((t) => matchesCategory(t, f.category))
    .filter((t) => !f.area || t.area === f.area || t.room === f.area)
    .filter((t) => !f.responsible || responsibleOf(t, contacts) === f.responsible)
    .filter((t) => !f.priority || t.priority === f.priority)
    .filter((t) =>
      f.status === 'all'
        ? true
        : f.status === 'blocked'
          ? !!t.blocker
          : f.status === 'longterm'
            ? t.kind === 'project'
            : t.status === f.status,
    )
    .filter((t) => {
      if (!f.dueBy) return true;
      const d = workDate(t);
      return !!d && d <= f.dueBy;
    })
    .sort(compareDaily(today));
}

export function reportCounts(rows: Task[], today: DateOnly): ReportCounts {
  return {
    open: rows.length,
    overdue: rows.filter((t) => isOverdue(t, today) || (t.kind === 'project' && !!t.milestoneDate && t.milestoneDate < today)).length,
    high: rows.filter((t) => t.priority === 'High').length,
    waiting: rows.filter((t) => t.status === 'waiting').length,
    blocked: rows.filter((t) => !!t.blocker).length,
  };
}

export function toRow(t: Task, contacts: Contact[], today: DateOnly): ReportRow {
  const due = workDate(t);
  const label = isPurchasing(t) && t.status === 'todo' ? 'Open' : STATUS_LABEL[t.status];
  const status = [t.kind === 'project' ? 'Long-term' : '', label, t.blocker ? 'Blocked' : ''].filter(Boolean).join(' · ');
  return {
    id: t.id,
    title: t.title,
    category: categoryLabel(t),
    reference: t.referenceNumber ?? '',
    area: t.area ?? '',
    equipment: equipmentText(t),
    opened: createdDate(t),
    daysOpen: daysOpen(t, today),
    responsible: responsibleOf(t, contacts) + (t.status === 'waiting' && t.waitingFor ? `\nWaiting for ${t.waitingFor}` : ''),
    status,
    priority: t.priority,
    due,
    overdue: !!due && due < today,
    nextAction: t.nextAction ?? '',
    followUp: t.nextFollowUp,
    blocker: t.blocker ?? '',
    managementAction: t.managementAction ?? '',
  };
}

export function describeFilters(f: ReportFilters): string[] {
  const out: string[] = [];
  if (f.category) out.push(`Category: ${f.category === 'purchasing' ? 'All purchasing' : CATEGORY_LABEL[f.category]}`);
  if (f.area) out.push(`Area / room: ${f.area}`);
  if (f.responsible) out.push(`Responsible: ${f.responsible}`);
  if (f.priority) out.push(`Priority: ${f.priority}`);
  if (f.status !== 'all')
    out.push(`Status: ${f.status === 'blocked' ? 'Blocked' : f.status === 'longterm' ? 'Long-term work' : STATUS_LABEL[f.status]}`);
  if (f.dueBy) out.push(`Work due on or before ${f.dueBy} (tasks without a due date are excluded)`);
  return out;
}

// ---------- Closed in the last 7 days ----------

export interface ClosedRow {
  id: string;
  title: string;
  category: string;
  reference: string;
  equipment: string;
  area: string;
  responsible: string;
  priority: Priority;
  opened: DateOnly;
  closed: DateOnly;
  daysOpen: number;
  completionNote: string;
  outcome: string;
}

export const CLOSED_WINDOW_DAYS = 7;

/** Tasks completed in the last 7 days (Israel dates). Area, responsible and priority filters apply;
 * status and due-date filters describe open work and do not apply here. */
export function selectClosedTasks(tasks: Task[], contacts: Contact[], f: ReportFilters, today: DateOnly): Task[] {
  return closedWithin(tasks, today, CLOSED_WINDOW_DAYS)
    .filter((t) => t.archiveReason !== 'duplicate' && matchesCategory(t, f.category))
    .filter((t) => !f.area || t.area === f.area || t.room === f.area)
    .filter((t) => !f.responsible || responsibleOf(t, contacts) === f.responsible)
    .filter((t) => !f.priority || t.priority === f.priority);
}

export function closedRow(t: Task, contacts: Contact[], today: DateOnly): ClosedRow {
  return {
    id: t.id,
    title: t.title,
    category: categoryLabel(t),
    reference: t.referenceNumber ?? '',
    equipment: equipmentText(t),
    area: t.area ?? '',
    responsible: responsibleOf(t, contacts),
    priority: t.priority,
    opened: createdDate(t),
    closed: closedDate(t)!,
    daysOpen: daysOpen(t, today),
    completionNote: t.completionNote ?? '',
    outcome: outcomeLabel(t),
  };
}

export const closedWindowStart = (today: DateOnly) => addDays(today, -(CLOSED_WINDOW_DAYS - 1));
