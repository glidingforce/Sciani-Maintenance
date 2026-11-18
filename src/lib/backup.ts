import type { Contact, ContactType, Dataset, Priority, Status, Task } from '../types';
import { CONTACT_TYPES, RECORD_CATEGORIES } from '../types';
import { uid } from './tasks';

/**
 * Data schema versions
 *  1 (or no version field): the first release. Exports looked like
 *    { app: 'scinai-maintenance', version: 1, exportedAt, mode, tasks, contacts };
 *    browser storage held { tasks, contacts } with no version at all.
 *  2: adds optional task fields waitingFor, waitingWhat, blocker,
 *    managementAction, and allows nextAction on every task. Nothing was
 *    renamed or removed, so v1 records are valid v2 records.
 *  3: adds optional task fields equipmentName, equipmentNumber, room.
 *    Again nothing renamed or removed: v1 and v2 records are valid v3 records.
 */
export const SCHEMA_VERSION = 3;
export const APP_ID = 'scinai-maintenance';

export interface BackupFile extends Dataset {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  mode?: string;
}

export interface ConvertResult {
  ok: boolean;
  data: Dataset;
  sourceVersion: number | 'none';
  warnings: string[];
  errors: string[];
  /** True when the input already matched the current schema exactly (no changes needed). */
  unchanged: boolean;
}

const PRIORITY_MAP: Record<string, Priority> = { high: 'High', normal: 'Normal', medium: 'Normal', low: 'Low' };
const STATUS_MAP: Record<string, Status> = {
  todo: 'todo',
  'to do': 'todo',
  open: 'todo',
  in_progress: 'in_progress',
  'in progress': 'in_progress',
  waiting: 'waiting',
  done: 'done',
  completed: 'done',
  complete: 'done',
  closed: 'done',
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})T/;
const DATE_FIELDS = ['dueDate', 'nextFollowUp', 'milestoneDate'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Keeps a value we could not convert, so it is never silently lost. */
function keepLegacy(rec: Record<string, unknown>, field: string, value: unknown) {
  const bag = isObj(rec._legacy) ? rec._legacy : {};
  bag[field] = value;
  rec._legacy = bag;
}

/** Date-only values are copied as text. A timestamp is cut to its own written
 * date (never converted through a time zone), and anything else is preserved. */
function convertDate(rec: Record<string, unknown>, field: string, label: string, warn: (m: string) => void) {
  const v = rec[field];
  if (v === undefined || v === null || v === '') {
    delete rec[field];
    return;
  }
  if (typeof v === 'string' && DATE_RE.test(v)) return;
  const m = typeof v === 'string' ? v.match(DATE_PREFIX_RE) : null;
  if (m) {
    rec[field] = m[1];
    warn(`${label}: ${field} "${v}" had a time part; kept the written date ${m[1]}.`);
    return;
  }
  keepLegacy(rec, field, v);
  delete rec[field];
  warn(`${label}: ${field} "${String(v)}" is not a date. Left empty; the original value is kept in the record.`);
}

function convertTask(raw: Record<string, unknown>, index: number, warn: (m: string) => void, now: string): Task {
  const t: Record<string, unknown> = { ...raw }; // copy: every unknown field is retained
  const label = `Task ${index + 1}${str(raw.title) ? ` (“${str(raw.title)}”)` : ''}`;

  if (!str(t.id)) {
    t.id = uid();
    warn(`${label}: had no ID; a new ID was assigned.`);
  }
  if (!str(t.title)?.trim()) {
    keepLegacy(t, 'title', t.title);
    t.title = '(untitled)';
    warn(`${label}: had no title; shown as “(untitled)”.`);
  }
  if (t.kind !== 'task' && t.kind !== 'project') {
    if (t.kind !== undefined) {
      keepLegacy(t, 'kind', t.kind);
      warn(`${label}: unknown type "${String(t.kind)}"; treated as a task.`);
    }
    t.kind = 'task';
  }
  // Priority: explicit, case-insensitive mapping. Unknown values are kept, never guessed upward.
  if (!['High', 'Normal', 'Low'].includes(t.priority as string)) {
    const mapped = typeof t.priority === 'string' ? PRIORITY_MAP[t.priority.trim().toLowerCase()] : undefined;
    if (mapped) {
      t.priority = mapped;
    } else {
      if (t.priority !== undefined) {
        keepLegacy(t, 'priority', t.priority);
        warn(`${label}: priority "${String(t.priority)}" is not recognized; set to Normal (original kept).`);
      }
      t.priority = 'Normal';
    }
  }
  if (!['todo', 'in_progress', 'waiting', 'done'].includes(t.status as string)) {
    const mapped = typeof t.status === 'string' ? STATUS_MAP[t.status.trim().toLowerCase()] : undefined;
    if (mapped) {
      t.status = mapped;
    } else {
      if (t.status !== undefined) {
        keepLegacy(t, 'status', t.status);
        warn(`${label}: status "${String(t.status)}" is not recognized; set to To do (original kept).`);
      }
      t.status = 'todo';
    }
  }
  if (t.owner !== 'me' && t.owner !== 'other') {
    if (t.owner !== undefined) keepLegacy(t, 'owner', t.owner);
    t.owner = 'me';
  }
  for (const f of DATE_FIELDS) convertDate(t, f, label, warn);
  t.archived = t.archived === true;
  if (t.category !== undefined && !RECORD_CATEGORIES.includes(t.category as typeof RECORD_CATEGORIES[number])) {
    keepLegacy(t, 'category', t.category); delete t.category;
    warn(`${label}: unknown category; original kept. Choose a category in the editor.`);
  }
  if (t.referenceNumber !== undefined && typeof t.referenceNumber !== 'string') {
    keepLegacy(t, 'referenceNumber', t.referenceNumber); delete t.referenceNumber;
    warn(`${label}: invalid reference number; original kept.`);
  }
  // Optional completion fields are additive: older closures stay unrecorded.
  for (const field of ['completionNote', 'solved'] as const) {
    const value = t[field];
    if (value !== undefined && (field === 'completionNote' ? typeof value !== 'string' : typeof value !== 'boolean')) {
      keepLegacy(t, field, value);
      delete t[field];
      warn(`${label}: ${field} has an invalid value; the original is kept in the record.`);
    }
  }
  if (!str(t.createdAt)) t.createdAt = str(t.updatedAt) ?? now;
  if (!str(t.updatedAt)) t.updatedAt = t.createdAt;
  if (t.status === 'done' && !str(t.completedAt)) {
    // Unknown completion time: leave it empty rather than invent one.
  }
  if (!Array.isArray(t.followUps)) {
    if (t.followUps !== undefined) {
      keepLegacy(t, 'followUps', t.followUps);
      warn(`${label}: follow-up history was not a list; original kept.`);
    }
    t.followUps = [];
  } else {
    t.followUps = (t.followUps as unknown[]).map((f, i) => {
      const e: Record<string, unknown> = isObj(f) ? { ...f } : { note: String(f) };
      if (!str(e.id)) e.id = uid();
      if (typeof e.note !== 'string') e.note = e.note === undefined ? '' : String(e.note);
      if (!(typeof e.date === 'string' && DATE_RE.test(e.date))) {
        const m = typeof e.date === 'string' ? e.date.match(DATE_PREFIX_RE) : null;
        if (m) e.date = m[1];
        else {
          keepLegacy(e, 'date', e.date);
          e.date = '';
          warn(`${label}: follow-up ${i + 1} has no valid date; original kept.`);
        }
      }
      if (!str(e.loggedAt)) e.loggedAt = '';
      return e;
    });
  }
  return t as unknown as Task;
}

function convertContact(raw: Record<string, unknown>, index: number, warn: (m: string) => void, now: string): Contact {
  const c: Record<string, unknown> = { ...raw };
  const label = `Contact ${index + 1}${str(raw.name) ? ` (“${str(raw.name)}”)` : ''}`;
  if (!str(c.id)) {
    c.id = uid();
    warn(`${label}: had no ID; a new ID was assigned.`);
  }
  if (!str(c.name)?.trim()) {
    keepLegacy(c, 'name', c.name);
    c.name = str(c.company) ?? '(no name)';
    warn(`${label}: had no name; shown as “${c.name}”.`);
  }
  if (!CONTACT_TYPES.includes(c.type as ContactType)) {
    const t = typeof c.type === 'string' ? c.type.toLowerCase() : '';
    const mapped = t === 'supplier' || t === 'vendor' ? 'Vendor' : t === 'contractor' ? 'Contractor' : t === 'internal' ? 'Internal' : undefined;
    if (c.type !== undefined && !mapped) {
      keepLegacy(c, 'type', c.type);
      warn(`${label}: type "${String(c.type)}" is not recognized; set to Other (original kept).`);
    }
    c.type = mapped ?? 'Other';
  }
  if (!str(c.createdAt)) c.createdAt = str(c.updatedAt) ?? now;
  if (!str(c.updatedAt)) c.updatedAt = c.createdAt;
  return c as unknown as Contact;
}

/** Keeps one record per ID: the most recently updated one. */
function dedupe<T extends { id: string; updatedAt?: string }>(list: T[], kind: string, warn: (m: string) => void): T[] {
  const byId = new Map<string, T>();
  for (const r of list) {
    const prev = byId.get(r.id);
    if (prev) {
      const keep = (r.updatedAt ?? '') >= (prev.updatedAt ?? '') ? r : prev;
      warn(`${kind} ID ${r.id} appears more than once; kept the most recently updated copy.`);
      byId.set(r.id, keep);
    } else byId.set(r.id, r);
  }
  return [...byId.values()];
}

/**
 * Validates and converts any supported input (export file, browser storage,
 * OneDrive data file) to the current schema. Pure: never modifies `input`.
 */
export function convertToCurrent(input: unknown): ConvertResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const empty: ConvertResult = { ok: false, data: { tasks: [], contacts: [] }, sourceVersion: 'none', warnings, errors, unchanged: false };

  if (!isObj(input)) {
    errors.push('The file does not contain a backup object.');
    return empty;
  }
  if (input.app !== undefined && input.app !== APP_ID) {
    errors.push(`This file belongs to a different app ("${String(input.app)}").`);
    return empty;
  }
  const version = typeof input.version === 'number' ? input.version : typeof input.schemaVersion === 'number' ? input.schemaVersion : 'none';
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    errors.push(`This backup was made by a newer version of the app (schema ${version}). Update the app before restoring it.`);
    return { ...empty, sourceVersion: version };
  }
  if (!Array.isArray(input.tasks) || !Array.isArray(input.contacts)) {
    errors.push('The file has no task and contact lists, so it is not a backup from this app.');
    return { ...empty, sourceVersion: version };
  }

  const before = JSON.stringify({ tasks: input.tasks, contacts: input.contacts });
  const now = new Date().toISOString();
  const tasks: Task[] = [];
  (input.tasks as unknown[]).forEach((r, i) => {
    if (isObj(r)) tasks.push(convertTask(structuredClone(r), i, warn, now));
    else errors.push(`Task entry ${i + 1} is not a record and cannot be read (value: ${JSON.stringify(r)?.slice(0, 60)}).`);
  });
  const contacts: Contact[] = [];
  (input.contacts as unknown[]).forEach((r, i) => {
    if (isObj(r)) contacts.push(convertContact(structuredClone(r), i, warn, now));
    else errors.push(`Contact entry ${i + 1} is not a record and cannot be read.`);
  });

  const data = { tasks: dedupe(tasks, 'Task', warn), contacts: dedupe(contacts, 'Contact', warn) };
  const contactIds = new Set(data.contacts.map((c) => c.id));
  for (const t of data.tasks) {
    if (t.contactId && !contactIds.has(t.contactId))
      warn(`Task “${t.title}” links to a contact that is not in this backup (ID ${t.contactId}); the link is kept.`);
  }
  // Entries that are not records at all block the restore: nothing is dropped silently.
  const ok = errors.length === 0;
  return { ok, data, sourceVersion: version, warnings, errors, unchanged: ok && warnings.length === 0 && before === JSON.stringify(data) };
}

export function makeBackup(data: Dataset, mode: string): BackupFile {
  return { app: APP_ID, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), mode, tasks: data.tasks, contacts: data.contacts };
}

// ---------- Restore planning ----------

export type RestoreMode = 'merge' | 'replace';

export interface RestorePlan {
  mode: RestoreMode;
  result: Dataset;
  added: number;
  updated: number;
  unchanged: number;
  removed: number; // replace only: current records not in the backup
}

/** Merge matches by stable ID: backup records overwrite same-ID records, new IDs are added, nothing is deleted or duplicated. */
export function planRestore(current: Dataset, backup: Dataset, mode: RestoreMode): RestorePlan {
  const count = { added: 0, updated: 0, unchanged: 0, removed: 0 };
  const mergeList = <T extends { id: string }>(cur: T[], inc: T[]) => {
    const map = new Map(cur.map((x) => [x.id, x]));
    for (const x of inc) {
      const prev = map.get(x.id);
      if (!prev) count.added++;
      else if (JSON.stringify(prev) === JSON.stringify(x)) count.unchanged++;
      else count.updated++;
      map.set(x.id, x);
    }
    return [...map.values()];
  };
  if (mode === 'merge') {
    const result = { tasks: mergeList(current.tasks, backup.tasks), contacts: mergeList(current.contacts, backup.contacts) };
    return { mode, result, ...count };
  }
  mergeList(current.tasks, backup.tasks);
  mergeList(current.contacts, backup.contacts);
  const inBackup = new Set([...backup.tasks, ...backup.contacts].map((r) => r.id));
  count.removed = [...current.tasks, ...current.contacts].filter((r) => !inBackup.has(r.id)).length;
  return { mode, result: { tasks: backup.tasks, contacts: backup.contacts }, ...count };
}
