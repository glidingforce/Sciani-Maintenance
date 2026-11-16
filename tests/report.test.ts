import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertToCurrent } from '../src/lib/backup';
import { DEFAULT_FILTERS, describeFilters, reportCounts, selectReportTasks, toRow } from '../src/lib/report';

const data = convertToCurrent(JSON.parse(readFileSync(new URL('./fixtures/v1-export.json', import.meta.url), 'utf8'))).data;
const today = '2026-11-16';

describe('management report selection', () => {
  it('defaults to every unfinished task, including waiting and unscheduled', () => {
    const rows = selectReportTasks(data.tasks, data.contacts, DEFAULT_FILTERS, today);
    const openIds = data.tasks.filter((t) => !t.archived && t.status !== 'done').map((t) => t.id).sort();
    expect(rows.map((t) => t.id).sort()).toEqual(openIds);
    expect(rows).toHaveLength(6);
    expect(rows.some((t) => !t.dueDate && t.kind === 'task')).toBe(true); // unscheduled kept
    expect(rows.some((t) => t.status === 'waiting')).toBe(true);
  });
  it('counts match the saved records', () => {
    const rows = selectReportTasks(data.tasks, data.contacts, DEFAULT_FILTERS, today);
    // HEPA due 12 Nov is overdue; AHU-02 is due today (not overdue).
    expect(reportCounts(rows, today)).toEqual({ open: 6, overdue: 1, high: 3, waiting: 1, blocked: 0 });
  });
  it('blocked is counted only when a blocker is recorded', () => {
    const tasks = data.tasks.map((t) => (t.title.startsWith('Huber') ? { ...t, blocker: 'No PO' } : t));
    const c = reportCounts(selectReportTasks(tasks, data.contacts, DEFAULT_FILTERS, today), today);
    expect([c.waiting, c.blocked]).toEqual([1, 1]);
  });
  it('a due-date filter excludes unscheduled work and says so', () => {
    const f = { ...DEFAULT_FILTERS, dueBy: '2026-11-30' };
    const rows = selectReportTasks(data.tasks, data.contacts, f, today);
    expect(rows.every((t) => t.dueDate || t.milestoneDate)).toBe(true);
    expect(describeFilters(f).join()).toMatch(/without a due date are excluded/);
  });
  it('filters by area and status, and rows carry no contact details or notes', () => {
    const rows = selectReportTasks(data.tasks, data.contacts, { ...DEFAULT_FILTERS, area: 'חדר נקי 3' }, today);
    expect(rows.map((t) => t.title)).toEqual(['החלפת מסנן HEPA בחדר נקי 3']);
    const row = toRow(rows[0], data.contacts, today);
    expect(JSON.stringify(row)).not.toMatch(/050-1234567|לתאם עם הייצור/);
    const waiting = selectReportTasks(data.tasks, data.contacts, { ...DEFAULT_FILTERS, status: 'waiting' }, today);
    expect(waiting.map((t) => t.title)).toEqual(['Huber chiller — coolant refill']);
    expect(toRow(waiting[0], data.contacts, today).responsible).toBe('Cooling Co קירור');
  });
});
