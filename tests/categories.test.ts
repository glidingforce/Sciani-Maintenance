import { describe, expect, it } from 'vitest';
import { applyQuick, complete, followUpDue, isOpen, newTask, setArchived } from '../src/lib/tasks';
import { categoryOf, inWorkspace, isPurchasing } from '../src/lib/categories';
import { convertToCurrent, makeBackup } from '../src/lib/backup';
import { closedRow, DEFAULT_FILTERS, selectClosedTasks, selectReportTasks, toRow } from '../src/lib/report';
import { todayISO } from '../src/lib/dates';
import { sortPurchasing } from '../src/lib/taskView';

const today = todayISO();
describe('duplicate archiving', () => {
  it('removes a duplicate from open work without completing or deleting it, and can restore it', () => {
    const task = newTask({ title: 'Alarm', notes: 'Keep me', followUps: [{ id: 'f', date: today, note: 'Investigated', loggedAt: '2026-11-18T08:00:00Z' }] });
    const archived = applyQuick(task, 'duplicate', today);
    expect(archived).toMatchObject({ id: task.id, archived: true, archiveReason: 'duplicate', status: 'todo', notes: task.notes, followUps: task.followUps });
    expect(archived.completedAt).toBeUndefined();
    expect(isOpen(archived)).toBe(false);
    expect(selectReportTasks([archived], [], DEFAULT_FILTERS, today)).toEqual([]);
    const restored = applyQuick(archived, 'restore', today);
    expect(isOpen(restored)).toBe(true);
    expect(restored.archiveReason).toBeUndefined();
    expect(setArchived(archived, false).archiveReason).toBeUndefined();
    expect(task.archived).toBe(false);
  });
  it('does not report a completed duplicate as another closure', () => {
    const task = complete(newTask({ title: 'Fixed' }), { note: 'Sensor replaced', solved: true });
    expect(selectClosedTasks([applyQuick(task, 'duplicate', today)], [], DEFAULT_FILTERS, today)).toEqual([]);
    expect(selectClosedTasks([applyQuick(task, 'archive', today)], [], DEFAULT_FILTERS, today)).toHaveLength(1);
  });
});
describe('purchasing and malfunction categories', () => {
  const malfunction = newTask({ title: 'Pressure alarm' });
  const quotation = newTask({ title: 'Compressor quotation', category: 'quotation', referenceNumber: 'הצעה-123', nextFollowUp: today });
  const order = newTask({ title: 'Belts order', category: 'purchase_order', nextFollowUp: '2020-01-01' });
  it('keeps old records unchanged and separates purchasing from malfunctions without guessing from titles', () => {
    expect(categoryOf(malfunction)).toBe('malfunction');
    expect(isPurchasing(newTask({ title: 'Quotation in an older record' }))).toBe(false);
    expect([malfunction, quotation, order].filter((t) => inWorkspace(t, false))).toEqual([malfunction]);
    expect([malfunction, quotation, order].filter((t) => inWorkspace(t, true))).toEqual([quotation, order]);
  });
  it('preserves category, reference and history in backup round trips', () => {
    const duplicate = applyQuick(quotation, 'duplicate', today);
    const restored = convertToCurrent(makeBackup({ tasks: [duplicate, order, malfunction], contacts: [] }, 'local'));
    expect(restored.ok).toBe(true);
    expect(restored.data.tasks).toEqual([duplicate, order, malfunction]);
  });
  it('supports due follow-ups independently of work due dates', () => {
    expect([quotation, order, malfunction].filter((t) => followUpDue(t, today))).toEqual([quotation, order]);
    expect(followUpDue({ ...order, archived: true }, today)).toBe(false);
  });
  it('puts due supplier follow-ups ahead of future work, and sorts by the earliest relevant date', () => {
    const later = { ...quotation, nextFollowUp: '2099-12-01', dueDate: '2099-12-02', priority: 'High' as const };
    const due = { ...order, nextFollowUp: today, dueDate: undefined, priority: 'Low' as const };
    expect(sortPurchasing([later, due], 'urgent', today)).toEqual([due, later]);
    expect(sortPurchasing([later, due], 'due', today)).toEqual([due, later]);
    const undated = { ...quotation, nextFollowUp: undefined, dueDate: undefined, priority: 'High' as const };
    expect(sortPurchasing([undated, later], 'urgent', today)).toEqual([later, undated]);
  });
  it('filters reports by category for open and closed records', () => {
    const tasks = [malfunction, quotation, order];
    expect(selectReportTasks(tasks, [], { ...DEFAULT_FILTERS, category: 'purchasing' }, today)).toHaveLength(2);
    expect(selectReportTasks(tasks, [], { ...DEFAULT_FILTERS, category: 'quotation' }, today)).toEqual([quotation]);
    expect(toRow(quotation, [], today)).toMatchObject({ category: 'Quotation · הצעת מחיר', reference: 'הצעה-123' });
    const closed = tasks.map((t) => complete(t, { note: 'Request processed', solved: true }));
    expect(selectClosedTasks(closed, [], { ...DEFAULT_FILTERS, category: 'purchasing' }, today)).toHaveLength(2);
    expect(closedRow(closed[1], [], today).outcome).toBe('Completed');
    expect(closedRow(closed[0], [], today).outcome).toBe('Solved');
  });
  it('preserves unknown imported categories without assigning them to purchasing', () => {
    const restored = convertToCurrent({ tasks: [{ ...malfunction, category: 'unknown' }], contacts: [] });
    expect(restored.ok).toBe(true);
    expect(restored.data.tasks[0]._legacy?.category).toBe('unknown');
    expect(categoryOf(restored.data.tasks[0])).toBe('malfunction');
  });
});
