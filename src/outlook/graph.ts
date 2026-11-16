import type { DateOnly, OutlookLink, Task } from '../types';
import { GRAPH_TIME_ZONE, addDays, zonedToUtc } from '../lib/dates';

/** Minimal Microsoft Graph calendar client. `getToken` supplies a delegated
 * Calendars.ReadWrite access token; `fetchImpl` is injectable for tests. */
export interface GraphDeps {
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

export class GraphError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface AgendaItem {
  id: string;
  subject: string;
  start: string; // wall clock in GRAPH_TIME_ZONE
  end: string;
  isAllDay: boolean;
  location?: string;
  webLink?: string;
  /** "occurrence" / "exception" for recurring series, else "singleInstance". */
  type: string;
}

const BASE = 'https://graph.microsoft.com/v1.0';
// Ask Graph to return every time already converted to Israel time, so no
// date arithmetic happens in the browser's own zone.
const PREFER_TZ = `outlook.timezone="${GRAPH_TIME_ZONE}"`;

async function call<T>(deps: GraphDeps, method: string, path: string, body?: unknown): Promise<T | null> {
  const token = await deps.getToken();
  const res = await (deps.fetchImpl ?? fetch)(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: PREFER_TZ,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch {
      /* non-JSON error body */
    }
    throw new GraphError(msg, res.status);
  }
  return (await res.json()) as T;
}

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string };
  webLink?: string;
  type?: string;
}

/** Upcoming appointments, recurring occurrences expanded by calendarView. */
export async function fetchAgenda(deps: GraphDeps, from: DateOnly, days = 7): Promise<AgendaItem[]> {
  const start = zonedToUtc(from).toISOString();
  const end = zonedToUtc(addDays(from, days)).toISOString();
  const q = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: 'subject,start,end,isAllDay,isCancelled,location,webLink,type',
    $orderby: 'start/dateTime',
    $top: '100',
  });
  const data = await call<{ value: GraphEvent[] }>(deps, 'GET', `/me/calendarView?${q}`);
  return (data?.value ?? [])
    .filter((e) => !e.isCancelled)
    .map((e) => ({
      id: e.id,
      subject: e.subject || '(No title)',
      start: e.start.dateTime,
      end: e.end.dateTime,
      isAllDay: !!e.isAllDay,
      location: e.location?.displayName || undefined,
      webLink: e.webLink,
      type: e.type ?? 'singleInstance',
    }));
}

export interface ScheduleInput {
  date: DateOnly;
  startTime: string; // HH:mm
  durationMinutes: number;
  subject: string;
  body?: string;
}

function toWallClock(date: DateOnly, time: string, plusMinutes = 0): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + plusMinutes;
  const d = addDays(date, Math.floor(total / 1440));
  const mins = ((total % 1440) + 1440) % 1440;
  return `${d}T${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
}

/**
 * Creates or updates the single Outlook event linked to a task.
 *
 * Duplicate protection:
 *  1. If the task already has an eventId, the event is PATCHed, never re-created.
 *  2. Otherwise the caller must have saved `link.transactionId` with the task
 *     BEFORE calling this. Graph treats a repeated POST with the same
 *     transactionId as the same event, so a retry after a lost response does
 *     not create a second appointment.
 */
export async function upsertEvent(deps: GraphDeps, link: OutlookLink, input: ScheduleInput): Promise<OutlookLink> {
  const payload = {
    subject: input.subject,
    start: { dateTime: toWallClock(input.date, input.startTime), timeZone: GRAPH_TIME_ZONE },
    end: { dateTime: toWallClock(input.date, input.startTime, input.durationMinutes), timeZone: GRAPH_TIME_ZONE },
    ...(input.body ? { body: { contentType: 'text', content: input.body } } : {}),
  };
  let ev: GraphEvent | null;
  if (link.eventId && link.state !== 'removed') {
    ev = await call<GraphEvent>(deps, 'PATCH', `/me/events/${encodeURIComponent(link.eventId)}`, payload);
  } else {
    ev = await call<GraphEvent>(deps, 'POST', '/me/events', { ...payload, transactionId: link.transactionId });
  }
  if (!ev) throw new GraphError('Outlook returned no event', 500);
  return {
    ...link,
    eventId: ev.id,
    webLink: ev.webLink,
    start: ev.start.dateTime,
    end: ev.end.dateTime,
    subject: ev.subject,
    timeZone: GRAPH_TIME_ZONE,
    state: 'scheduled',
    lastChecked: new Date().toISOString(),
  };
}

/** Re-reads one linked event. A deleted or cancelled event becomes "removed";
 * the task itself is never touched beyond its link. */
export async function refreshLink(deps: GraphDeps, link: OutlookLink): Promise<OutlookLink> {
  if (!link.eventId || link.state === 'removed') return link;
  try {
    const ev = await call<GraphEvent>(
      deps,
      'GET',
      `/me/events/${encodeURIComponent(link.eventId)}?$select=subject,start,end,webLink,isCancelled`,
    );
    if (!ev || ev.isCancelled) return { ...link, state: 'removed', lastChecked: new Date().toISOString() };
    return {
      ...link,
      start: ev.start.dateTime,
      end: ev.end.dateTime,
      subject: ev.subject,
      webLink: ev.webLink,
      state: 'scheduled',
      lastChecked: new Date().toISOString(),
    };
  } catch (e) {
    if (e instanceof GraphError && (e.status === 404 || e.status === 410)) {
      return { ...link, state: 'removed', lastChecked: new Date().toISOString() };
    }
    throw e;
  }
}

/** Deletes only the event this app created for the task. */
export async function deleteLinkedEvent(deps: GraphDeps, link: OutlookLink): Promise<void> {
  if (!link.eventId) return;
  try {
    await call(deps, 'DELETE', `/me/events/${encodeURIComponent(link.eventId)}`);
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return; // already gone
    throw e;
  }
}

/** True when the stored link differs from what Outlook now reports. */
export function linkChanged(a: OutlookLink | undefined, b: OutlookLink): boolean {
  return !a || a.state !== b.state || a.start !== b.start || a.end !== b.end || a.subject !== b.subject || a.webLink !== b.webLink;
}

export const scheduledTasks = (tasks: Task[]) => tasks.filter((t) => t.outlook?.eventId && t.outlook.state === 'scheduled');
