import { describe, expect, it } from 'vitest';
import { complete, isOpen, newTask, reopen } from '../src/lib/tasks';
import { convertToCurrent, makeBackup } from '../src/lib/backup';
import { closedRow, DEFAULT_FILTERS, selectClosedTasks } from '../src/lib/report';
import { todayISO } from '../src/lib/dates';

describe('task completion details', () => {
  it.each([true, false])('closes with solved=%s and includes the description and outcome in report data', (solved) => {
    const task = complete(newTask({ title: 'Repair pump' }), { note: '  Replaced seal and tested pump.  ', solved });
    expect(task).toMatchObject({ status: 'done', completionNote: 'Replaced seal and tested pump.', solved });
    expect(task.completedAt).toBeTruthy();
    expect(isOpen(task)).toBe(false);
    const today = todayISO();
    expect(selectClosedTasks([task], [], DEFAULT_FILTERS, today)).toEqual([task]);
    expect(closedRow(task, [], today)).toMatchObject({ completionNote: 'Replaced seal and tested pump.', outcome: solved ? 'Solved' : 'Not solved' });
  });
  it('rejects empty descriptions without changing the original task', () => {
    const task = newTask();
    expect(() => complete(task, { note: ' \n ', solved: true })).toThrow(/Describe/);
    expect(task.status).toBe('todo');
    expect(task.completedAt).toBeUndefined();
  });
  it('preserves details through backups and replaces them on a later closure', () => {
    const task = complete(newTask({ title: 'Check sensor' }), { note: 'נבדק החיישן. התקלה עדיין קיימת.', solved: false });
    const restored = convertToCurrent(makeBackup({ tasks: [task], contacts: [] }, 'local'));
    expect(restored.ok).toBe(true);
    expect(restored.data.tasks[0]).toEqual(task);
    const opened = reopen(task);
    expect(isOpen(opened)).toBe(true);
    expect(selectClosedTasks([opened], [], DEFAULT_FILTERS, todayISO())).toHaveLength(0);
    expect(complete(opened, { note: 'Sensor replaced and verified.', solved: true })).toMatchObject({ completionNote: 'Sensor replaced and verified.', solved: true });
  });
  it('does not invent solved status or descriptions for older completed tasks', () => {
    const task = complete(newTask());
    expect(closedRow(task, [], todayISO())).toMatchObject({ outcome: 'Not recorded', completionNote: '' });
  });
  it('keeps malformed imported completion values under legacy data', () => {
    const restored = convertToCurrent({ tasks: [{ ...newTask(), completionNote: { bad: true }, solved: 'yes' }], contacts: [] });
    expect(restored.ok).toBe(true);
    expect(restored.data.tasks[0].completionNote).toBeUndefined();
    expect(restored.data.tasks[0].solved).toBeUndefined();
    expect(restored.data.tasks[0]._legacy).toMatchObject({ completionNote: { bad: true }, solved: 'yes' });
  });
});
