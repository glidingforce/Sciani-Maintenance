import { describe, expect, it, vi } from 'vitest';
import { refreshLink, upsertEvent, fetchAgenda } from '../src/outlook/graph';
import type { OutlookLink } from '../src/types';

function fakeGraph() {
  const events = new Map<string, any>();
  const byTxn = new Map<string, string>();
  const calls: { method: string; url: string; body?: any; prefer?: string }[] = [];
  let n = 0;
  const fetchImpl = vi.fn(async (url: string, init: any) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, url, body, prefer: init.headers.Prefer });
    const json = (status: number, data?: unknown) => new Response(data === undefined ? null : JSON.stringify(data), { status });
    const m = url.match(/\/me\/events\/([^?]+)/);
    if (init.method === 'POST') {
      // Graph's transactionId behaviour: same id -> same event.
      const existing = body.transactionId && byTxn.get(body.transactionId);
      if (existing) return json(201, events.get(existing));
      const id = `ev${++n}`;
      const ev = { id, webLink: `https://outlook/${id}`, subject: body.subject, start: body.start, end: body.end };
      events.set(id, ev);
      if (body.transactionId) byTxn.set(body.transactionId, id);
      return json(201, ev);
    }
    if (init.method === 'PATCH' && m) {
      const ev = { ...events.get(m[1]), ...body };
      events.set(m[1], ev);
      return json(200, ev);
    }
    if (init.method === 'GET' && m) {
      const ev = events.get(decodeURIComponent(m[1]));
      return ev ? json(200, ev) : json(404, { error: { message: 'not found' } });
    }
    if (init.method === 'GET' && url.includes('calendarView')) {
      return json(200, { value: [
        { id: 'r1', subject: 'Weekly ops', start: { dateTime: '2026-11-16T09:00:00.0000000' }, end: { dateTime: '2026-11-16T09:30:00.0000000' }, type: 'occurrence' },
        { id: 'c1', subject: 'Cancelled', isCancelled: true, start: { dateTime: '2026-11-16T10:00:00' }, end: { dateTime: '2026-11-16T11:00:00' } },
      ] });
    }
    return json(400, { error: { message: 'unexpected' } });
  });
  return { events, calls, deps: { getToken: async () => 'token', fetchImpl: fetchImpl as unknown as typeof fetch } };
}

const input = { date: '2026-11-18', startTime: '09:00', durationMinutes: 90, subject: 'Chiller visit' };

describe('Outlook event linking', () => {
  it('a retried create with the same transaction id does not duplicate', async () => {
    const g = fakeGraph();
    const pending: OutlookLink = { transactionId: 'txn-1', timeZone: 'Israel Standard Time', state: 'pending' };
    const first = await upsertEvent(g.deps, pending, input);
    // Simulate: response lost, link never saved, user retries from the pending link.
    const retry = await upsertEvent(g.deps, pending, input);
    expect(retry.eventId).toBe(first.eventId);
    expect(g.events.size).toBe(1);
    expect(first.start).toBe('2026-11-18T09:00:00');
    expect(first.end).toBe('2026-11-18T10:30:00');
    expect(g.calls[0].body.start.timeZone).toBe('Israel Standard Time');
  });

  it('rescheduling a linked task patches the same event', async () => {
    const g = fakeGraph();
    const link = await upsertEvent(g.deps, { transactionId: 't', timeZone: 'Israel Standard Time', state: 'pending' }, input);
    const moved = await upsertEvent(g.deps, link, { ...input, startTime: '23:30', durationMinutes: 60, subject: 'Renamed' });
    expect(moved.eventId).toBe(link.eventId);
    expect(moved.end).toBe('2026-11-19T00:30:00');
    expect(moved.subject).toBe('Renamed');
    expect(g.events.size).toBe(1);
    expect(g.calls.map((c) => c.method)).toEqual(['POST', 'PATCH']);
  });

  it('an event deleted in Outlook marks the link removed without failing', async () => {
    const g = fakeGraph();
    const link = await upsertEvent(g.deps, { transactionId: 't', timeZone: 'Israel Standard Time', state: 'pending' }, input);
    g.events.clear();
    const after = await refreshLink(g.deps, link);
    expect(after.state).toBe('removed');
    expect(after.eventId).toBe(link.eventId);
  });

  it('picks up a time change made in Outlook', async () => {
    const g = fakeGraph();
    const link = await upsertEvent(g.deps, { transactionId: 't', timeZone: 'Israel Standard Time', state: 'pending' }, input);
    g.events.set(link.eventId!, { ...g.events.get(link.eventId!), start: { dateTime: '2026-11-19T13:00:00' }, end: { dateTime: '2026-11-19T14:00:00' } });
    const after = await refreshLink(g.deps, link);
    expect(after.state).toBe('scheduled');
    expect(after.start).toBe('2026-11-19T13:00:00');
  });

  it('agenda asks for Israel time, keeps recurring occurrences, drops cancelled', async () => {
    const g = fakeGraph();
    const items = await fetchAgenda(g.deps, '2026-11-16');
    expect(items.map((i) => i.subject)).toEqual(['Weekly ops']);
    expect(items[0].type).toBe('occurrence');
    expect(g.calls[0].prefer).toBe('outlook.timezone="Israel Standard Time"');
    expect(g.calls[0].url).toContain('startDateTime=2026-11-15T22%3A00%3A00.000Z');
  });
});
