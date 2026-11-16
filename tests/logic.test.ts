import { describe, expect, it } from 'vitest';
import { addDays, todayISO, zonedToUtc, zoneOffsetMinutes } from '../src/lib/dates';
import { complete, dailyCounts, followUps, logFollowUp, newTask, priorityList, reopen, setArchived, searchTasks } from '../src/lib/tasks';
import { demoData } from '../src/storage/demo';

const today = '2026-11-16';

describe('daily ordering', () => {
  it('puts overdue first, then priority, then due date', () => {
    const tasks = [
      newTask({ title: 'normal today', priority: 'Normal', dueDate: today }),
      newTask({ title: 'low overdue', priority: 'Low', dueDate: '2026-11-10' }),
      newTask({ title: 'high later', priority: 'High', dueDate: '2026-11-20' }),
      newTask({ title: 'high today', priority: 'High', dueDate: today }),
      newTask({ title: 'high undated', priority: 'High' }),
      newTask({ title: 'done overdue', priority: 'High', dueDate: '2026-11-01', status: 'done' }),
    ];
    expect(priorityList(tasks, today).map((t) => t.title)).toEqual([
      'low overdue',
      'high today',
      'high later',
      'high undated',
      'normal today',
    ]);
  });

  it('a manual priority change reorders immediately', () => {
    const a = newTask({ title: 'a', priority: 'Normal', dueDate: today });
    const b = newTask({ title: 'b', priority: 'Normal', dueDate: today });
    expect(priorityList([a, b], today)[0].title).toBe('a');
    expect(priorityList([a, { ...b, priority: 'High' }], today)[0].title).toBe('b');
  });

  it('filters by owner', () => {
    const mine = newTask({ title: 'mine' });
    const theirs = newTask({ title: 'theirs', owner: 'other' });
    expect(priorityList([mine, theirs], today, 'mine').map((t) => t.title)).toEqual(['mine']);
    expect(priorityList([mine, theirs], today, 'others').map((t) => t.title)).toEqual(['theirs']);
  });
});

describe('counts reflect completion and archive state', () => {
  it('counts only open short-term tasks', () => {
    const t1 = newTask({ priority: 'High', dueDate: today });
    const t2 = newTask({ priority: 'High', dueDate: today, owner: 'other' });
    const t3 = newTask({ dueDate: '2026-11-01' });
    const p = newTask({ kind: 'project', priority: 'High', nextAction: 'x' });
    let tasks = [t1, t2, t3, p];
    expect(dailyCounts(tasks, today)).toEqual({ high: 2, dueToday: 2, overdue: 1, withOthers: 1 });
    tasks = [complete(t1), t2, setArchived(t3, true), p];
    expect(dailyCounts(tasks, today)).toEqual({ high: 1, dueToday: 1, overdue: 0, withOthers: 1 });
    tasks = [reopen(complete(t1)), t2, t3, p];
    expect(dailyCounts(tasks, today).high).toBe(2);
  });
});

describe('follow-ups', () => {
  it('logging keeps the task open and sets the next date', () => {
    const t = newTask({ owner: 'other', status: 'waiting', nextFollowUp: today });
    const logged = logFollowUp(t, { date: today, note: ' called ', next: '2026-11-19' });
    expect(logged.status).toBe('waiting');
    expect(logged.completedAt).toBeUndefined();
    expect(logged.followUps).toHaveLength(1);
    expect(logged.followUps[0].note).toBe('called');
    expect(logged.nextFollowUp).toBe('2026-11-19');
    expect(logFollowUp(logged, { date: today, note: '' }).nextFollowUp).toBeUndefined();
  });

  it('lists follow-ups due within a week, earliest first, and drops done work', () => {
    const a = newTask({ title: 'a', nextFollowUp: '2026-11-18' });
    const b = newTask({ title: 'b', nextFollowUp: '2026-11-14' });
    const c = newTask({ title: 'c', nextFollowUp: '2026-12-30' });
    const d = complete(newTask({ title: 'd', nextFollowUp: today }));
    expect(followUps([a, b, c, d], today).map((t) => t.title)).toEqual(['b', 'a']);
  });
});

describe('search', () => {
  it('matches title, area and linked contact', () => {
    const data = demoData();
    expect(searchTasks(data.tasks, 'ahu', data.contacts).length).toBeGreaterThan(0);
    expect(searchTasks(data.tasks, 'cooling contractor', data.contacts).map((t) => t.title)).toEqual(['Confirm chiller service visit']);
  });
});

describe('Asia/Jerusalem dates and DST', () => {
  it('today follows Israel time, not UTC', () => {
    // 23:30 UTC on 16 Nov is 01:30 on 17 Nov in Israel (UTC+2).
    expect(todayISO(new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-17');
  });
  it('offset is +3 in summer and +2 in winter', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(180);
    expect(zoneOffsetMinutes(new Date('2026-12-01T12:00:00Z'))).toBe(120);
  });
  it('local midnight converts correctly on both sides of the October change', () => {
    expect(zonedToUtc('2026-10-24').toISOString()).toBe('2026-10-23T21:00:00.000Z');
    expect(zonedToUtc('2026-10-26').toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
  it('adds calendar days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

import { applyQuick, doneToday, groupForToday, morningSummary } from '../src/lib/tasks';

describe('Today grouping and quick actions', () => {
  it('groups open tasks into overdue / today / next 7 days / later', () => {
    const tasks = [
      newTask({ title: 'od', dueDate: '2026-11-10' }),
      newTask({ title: 'td', dueDate: today }),
      newTask({ title: 'soon', dueDate: '2026-11-20' }),
      newTask({ title: 'far', dueDate: '2026-12-20' }),
      newTask({ title: 'nodate' }),
    ];
    const g = groupForToday(tasks, today);
    expect([g.overdue, g.today, g.soon, g.later].map((l) => l.map((t) => t.title))).toEqual([['od'], ['td'], ['soon'], ['far', 'nodate']]);
  });

  it('postpone moves the due date and clears overdue', () => {
    const t = newTask({ dueDate: '2026-11-10' });
    const moved = applyQuick(t, 'tomorrow', today);
    expect(moved.dueDate).toBe('2026-11-17');
    expect(groupForToday([moved], today).overdue).toHaveLength(0);
    expect(applyQuick(t, 'start', today).status).toBe('in_progress');
  });

  it('done today uses the Israel date of completion', () => {
    const t = { ...complete(newTask({ title: 'x' })), completedAt: '2026-11-15T23:30:00Z' }; // 01:30 on the 16th in Israel
    expect(doneToday([t], today)).toHaveLength(1);
  });

  it('writes a plain morning summary', () => {
    expect(morningSummary({ high: 1, dueToday: 3, overdue: 1, withOthers: 0 }, 2)).toBe('You have 1 overdue, 3 due today and 2 follow-ups to make.');
    expect(morningSummary({ high: 0, dueToday: 0, overdue: 0, withOthers: 0 }, 0)).toMatch(/Nothing due today/);
  });
});

import { classify, dailyList } from '../src/lib/tasks';

describe('daily list', () => {
  const mk = (title: string, extra = {}) => newTask({ title, ...extra });
  it('puts each task in exactly one group, the most urgent, with all reasons', () => {
    const tasks = [
      mk('overdue+fu', { dueDate: '2026-11-10', nextFollowUp: '2026-11-18' }),
      mk('fu due', { nextFollowUp: today, dueDate: '2026-11-30' }),
      mk('due soon', { dueDate: '2026-11-19' }),
      mk('fu soon', { nextFollowUp: '2026-11-17' }),
      mk('no dates'),
      mk('far', { dueDate: '2026-12-31' }),
      mk('project quiet', { kind: 'project', nextAction: 'x', milestoneDate: '2027-01-15' }),
      mk('project due', { kind: 'project', nextAction: 'Book crane', milestoneDate: today }),
      complete(mk('done overdue', { dueDate: '2026-11-01' })),
      setArchived(mk('archived'), true),
    ];
    const l = dailyList(tasks, today);
    const titles = (g: keyof typeof l) => l[g].map((i) => i.task.title);
    expect(titles('attention').sort()).toEqual(['fu due', 'overdue+fu', 'project due']);
    expect(titles('coming').sort()).toEqual(['due soon', 'fu soon']);
    expect(titles('unscheduled')).toEqual(['no dates']);
    expect(titles('later')).toEqual(['far']);
    expect(titles('longterm')).toEqual(['project quiet']);
    const all = Object.values(l).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all.map((i) => i.task.id)).size).toBe(8);
    expect(classify(tasks[0], today).reasons.map((r) => r.label)).toEqual(['Overdue · 10 Nov', 'Follow-up 18 Nov']);
    expect(classify(tasks[1], today).reasons.map((r) => r.label)).toEqual(['Due 30 Nov', 'Follow-up due']);
  });
  it('blocked is shown only when a blocker is recorded, not for every waiting task', () => {
    expect(classify(mk('w', { status: 'waiting' }), today).reasons.some((r) => r.label === 'Blocked')).toBe(false);
    expect(classify(mk('b', { status: 'waiting', blocker: 'No PO' }), today).reasons.some((r) => r.label === 'Blocked')).toBe(true);
  });
});
