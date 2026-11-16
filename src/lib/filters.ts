import type { Contact, Priority, Status, Task } from '../types';
import { ownerLabel, searchTasks } from './tasks';
import { getMyName } from './settings';

/** Filters for the Today list. Empty values mean "all". */
export interface ViewFilter {
  who: '' | 'me' | 'others' | `person:${string}`;
  place: string; // area or room
  priority: '' | Priority;
  status: '' | Status | 'blocked';
  q: string;
}

export const NO_FILTER: ViewFilter = { who: '', place: '', priority: '', status: '', q: '' };

export const isFiltered = (f: ViewFilter) => !!(f.who || f.place || f.priority || f.status || f.q.trim());

export function filterOptions(tasks: Task[], contacts: Contact[]) {
  const open = tasks.filter((t) => !t.archived && t.status !== 'done');
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  return {
    people: uniq(open.filter((t) => t.owner === 'other').map((t) => ownerLabel(t, contacts))),
    places: uniq(open.flatMap((t) => [t.area, t.room])),
  };
}

export function applyView(tasks: Task[], contacts: Contact[], f: ViewFilter): Task[] {
  const list = tasks.filter((t) => {
    if (f.who === 'me' && t.owner !== 'me') return false;
    if (f.who === 'others' && t.owner !== 'other') return false;
    if (f.who.startsWith('person:') && (t.owner !== 'other' || ownerLabel(t, contacts) !== f.who.slice(7))) return false;
    if (f.place && t.area !== f.place && t.room !== f.place) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status === 'blocked' ? !t.blocker : f.status && t.status !== f.status) return false;
    return true;
  });
  return f.q.trim() ? searchTasks(list, f.q, contacts) : list;
}

export function describeView(f: ViewFilter): string {
  const parts: string[] = [];
  if (f.who === 'me') parts.push(getMyName());
  else if (f.who === 'others') parts.push('others');
  else if (f.who) parts.push(f.who.slice(7));
  if (f.place) parts.push(f.place);
  if (f.priority) parts.push(`${f.priority} priority`);
  if (f.status) parts.push(f.status === 'blocked' ? 'blocked' : f.status.replace('_', ' '));
  if (f.q.trim()) parts.push(`“${f.q.trim()}”`);
  return parts.join(', ');
}
