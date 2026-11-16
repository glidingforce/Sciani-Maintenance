import { describe, expect, it } from 'vitest';
import { newTask } from '../src/lib/tasks';
import { matchesFocus, sortTasks } from '../src/lib/taskView';

const today = '2026-11-16';
describe('priority cards', () => {
  it('keeps work due dates separate from follow-ups and includes project milestones', () => {
    const task = newTask({ dueDate: '2026-11-20', nextFollowUp: today });
    expect(matchesFocus(task, 'today', today)).toBe(false);
    expect(matchesFocus(task, 'followup', today)).toBe(true);
    const project = newTask({ kind: 'project', milestoneDate: '2026-11-15' });
    expect(matchesFocus(project, 'overdue', today)).toBe(true);
    expect(matchesFocus({ ...project, milestoneDate: today }, 'today', today)).toBe(true);
  });
  it('excludes completed and archived work from every card', () => {
    const task = newTask({ dueDate: '2026-11-15', nextFollowUp: today, status: 'waiting' });
    for (const focus of ['overdue', 'today', 'followup', 'waiting'] as const) {
      expect(matchesFocus({ ...task, status: 'done' }, focus, today)).toBe(false);
      expect(matchesFocus({ ...task, archived: true }, focus, today)).toBe(false);
    }
  });
});
describe('task sorting', () => {
  const a = newTask({ title: 'undated', priority: 'Low', createdAt: '2026-11-01T10:00:00Z' });
  const b = newTask({ title: 'project', kind: 'project', milestoneDate: today, priority: 'High', createdAt: '2026-11-02T10:00:00Z' });
  const c = newTask({ title: 'task', dueDate: '2026-11-14', createdAt: '2026-11-03T10:00:00Z' });
  it('sorts work dates with undated work last without changing the source list', () => {
    const source = [a, b, c];
    expect(sortTasks(source, 'due', today).map((t) => t.title)).toEqual(['task', 'project', 'undated']);
    expect(source).toEqual([a, b, c]);
  });
  it('supports priority and age ordering', () => {
    expect(sortTasks([a, b, c], 'priority', today).map((t) => t.title)).toEqual(['project', 'task', 'undated']);
    expect(sortTasks([c, b, a], 'oldest', today).map((t) => t.title)).toEqual(['undated', 'project', 'task']);
  });
});
