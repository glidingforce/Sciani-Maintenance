import { useState } from 'react';
import { CheckCircle2, FileText, Plus, Search, X } from 'lucide-react';
import type { Contact, Priority, Task } from '../types';
import { STATUS_LABEL } from '../types';
import { addDays, longDate, shortDate } from '../lib/dates';
import { closedWithin, dailyList, doneToday, newTask, type DailyGroup, type DailyItem, type QuickAction } from '../lib/tasks';
import { NO_FILTER, applyView, describeView, filterOptions, isFiltered, type ViewFilter } from '../lib/filters';
import { getMyName } from '../lib/settings';
import { DailyRow, TaskRow } from './TaskRow';
import { matchesFocus, sortTasks, type Focus, type TaskSort as Sort } from '../lib/taskView';
import { TaskSort } from './TaskSort';

function QuickAdd({ today, onAdd }: { today: string; onAdd: (t: Task) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'week' | 'none' | 'pick'>('none');
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [busy, setBusy] = useState(false);
  const due = when === 'pick' ? date || undefined : { today, tomorrow: addDays(today, 1), week: addDays(today, 7), none: undefined }[when];
  const me = getMyName();

  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const other = who.trim() && who.trim().toLowerCase() !== me.toLowerCase();
        const ok = await onAdd(newTask({ title: title.trim(), dueDate: due, priority, ...(other ? { owner: 'other' as const, assignee: who.trim() } : {}) }));
        setBusy(false);
        if (ok) {
          setTitle('');
          setWho('');
          setPriority('Normal');
        }
      }}
    >
      <label className="sr-only" htmlFor="quick-title">
        New task title
      </label>
      <input id="quick-title" className="input" placeholder="New task: type and press Enter" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add'}</button>
      <details className="quick-options"><summary>Set date, owner or priority</summary><div className="quick-controls">
        <select className="input" aria-label="Work due" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="none">No due date</option>
          <option value="today">Due today</option>
          <option value="tomorrow">Due tomorrow</option>
          <option value="week">Due next week</option>
          <option value="pick">Pick a date…</option>
        </select>
        {when === 'pick' && <input className="input" type="date" aria-label="Due date" value={date} onChange={(e) => setDate(e.target.value)} />}
        <input className="input who" aria-label={`Responsible (leave empty for ${me})`} placeholder={`Who? (${me})`} value={who} onChange={(e) => setWho(e.target.value)} />
        <button type="button" className={`chip-toggle${priority === 'High' ? ' on' : ''}`} aria-pressed={priority === 'High'} onClick={() => setPriority((p) => (p === 'High' ? 'Normal' : 'High'))}>
          High
        </button>
      </div></details>
    </form>
  );
}

export function FilterBar(props: { f: ViewFilter; set: (f: ViewFilter) => void; tasks: Task[]; contacts: Contact[] }) {
  const { f, set } = props;
  const opts = filterOptions(props.tasks, props.contacts);
  const me = getMyName();
  const [more, setMore] = useState(false);
  const active = [f.who, f.place, f.priority, f.status].filter(Boolean).length;
  return (
    <div className="filter-bar" role="search" aria-label="Filter tasks">
      <label className="filter-search">
        <Search className="icon" aria-hidden="true" />
        <span className="sr-only">Search</span>
        <input className="input" type="search" placeholder="Search task, equipment, room…" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
      </label>
      <button type="button" className="btn filter-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        Filters{active ? ` (${active})` : ''}
      </button>
      <div className={`filter-selects${more ? ' open' : ''}`}>
      <select className="input" aria-label="Responsible" value={f.who} onChange={(e) => set({ ...f, who: e.target.value as ViewFilter['who'] })}>
        <option value="">Everyone</option>
        <option value="me">{me}</option>
        <option value="others">Others (all)</option>
        {opts.people.map((p) => (
          <option key={p} value={`person:${p}`}>
            {p}
          </option>
        ))}
      </select>
      <select className="input" aria-label="Area or room" value={f.place} onChange={(e) => set({ ...f, place: e.target.value })}>
        <option value="">All areas / rooms</option>
        {opts.places.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select className="input" aria-label="Priority" value={f.priority} onChange={(e) => set({ ...f, priority: e.target.value as ViewFilter['priority'] })}>
        <option value="">Any priority</option>
        <option>High</option>
        <option>Normal</option>
        <option>Low</option>
      </select>
      <select className="input" aria-label="Status" value={f.status} onChange={(e) => set({ ...f, status: e.target.value as ViewFilter['status'] })}>
        <option value="">Any status</option>
        <option value="todo">{STATUS_LABEL.todo}</option>
        <option value="in_progress">{STATUS_LABEL.in_progress}</option>
        <option value="waiting">{STATUS_LABEL.waiting}</option>
        <option value="blocked">Blocked</option>
      </select>
      </div>
      {isFiltered(f) && (
        <button type="button" className="btn clear-filters" onClick={() => set(NO_FILTER)}>
          <X className="icon" /> Clear
        </button>
      )}
    </div>
  );
}

const MAIN_GROUPS: { key: DailyGroup; title: string; tone?: string; hint?: string; collapsed?: boolean }[] = [
  { key: 'attention', title: 'Needs attention', tone: 'attention' },
  { key: 'coming', title: 'Coming up · next 7 days' },
  { key: 'unscheduled', title: 'Not scheduled', hint: 'No due date and no follow-up date. Open one to schedule it.' },
  { key: 'later', title: 'Later', collapsed: true },
];

export function Today(props: {
  tasks: Task[];
  contacts: Contact[];
  today: string;
  storageNote: React.ReactNode;
  onAdd: () => void;
  onReport: () => void;
  onQuickAdd: (t: Task) => Promise<boolean>;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  onQuick: (t: Task, a: QuickAction) => void;
  onLog: (t: Task) => void;
  outlookSlot: React.ReactNode;
}) {
  const { contacts, today } = props;
  const [f, setF] = useState<ViewFilter>(NO_FILTER);
  const [focus, setFocus] = useState<Focus>('');
  const [sort, setSort] = useState<Sort>('urgent');
  const filtered = isFiltered(f) || !!focus;
  const tasks = applyView(props.tasks, contacts, f).filter((t) => matchesFocus(t, focus, today));
  const list = dailyList(tasks, today);
  const done = doneToday(tasks, today);
  const closedWeek = closedWithin(tasks, today, 7);
  const rowProps = { contacts, today, onOpen: props.onOpen, onToggle: props.onToggle, onQuick: props.onQuick, onLog: props.onLog };
  const n = (g: DailyGroup) => list[g].length;
  const open = Object.values(list).flat().map((i) => i.task);
  const openTotal = open.length;

  const summary = [
    `${n('attention')} need${n('attention') === 1 ? 's' : ''} attention`,
    n('coming') ? `${n('coming')} coming up` : '',
    n('unscheduled') ? `${n('unscheduled')} not scheduled` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const attentionEmpty =
    openTotal === 0
      ? props.tasks.length === 0
        ? 'No tasks yet. Type the first one above.'
        : filtered
          ? 'No open tasks match these filters.'
          : 'No open work. Everything is done.'
      : `Nothing overdue, due today or waiting on a follow-up today.${n('coming') ? ` ${n('coming')} coming up this week.` : ''}${
          n('unscheduled') ? ` ${n('unscheduled')} task${n('unscheduled') > 1 ? 's have' : ' has'} no date yet.` : ''
        }`;

  const renderItems = (items: DailyItem[]) => {
    if (sort === 'urgent') return items.map((i) => <DailyRow key={i.task.id} item={i} {...rowProps} />);
    const byId = new Map(items.map((i) => [i.task.id, i]));
    return sortTasks(items.map((i) => i.task), sort, today).map((t) => <DailyRow key={t.id} item={byId.get(t.id)!} {...rowProps} />);
  };
  const allOpen = props.tasks.filter((t) => !t.archived && t.status !== 'done');
  const focusCards: { key: Exclude<Focus, ''>; label: string; hint: string; tone: string }[] = [
    { key: 'overdue', label: 'Overdue', hint: 'Past the work due date', tone: 'urgent' },
    { key: 'today', label: 'Due today', hint: 'Work planned for today', tone: 'plum' },
    { key: 'followup', label: 'Follow-ups due', hint: 'Time to check in', tone: 'amber' },
    { key: 'waiting', label: 'Waiting', hint: 'With someone else', tone: 'amber' },
  ];

  const overview: [string, number, (() => void) | undefined, string?][] = [
    ['Coming up (7 days)', n('coming'), undefined],
    ['Not scheduled', n('unscheduled'), undefined],
    ['Waiting', open.filter((t) => t.status === 'waiting').length, () => setF({ ...f, status: f.status === 'waiting' ? '' : 'waiting' })],
    ['Blocked', open.filter((t) => !!t.blocker).length, () => setF({ ...f, status: f.status === 'blocked' ? '' : 'blocked' })],
    ['Closed in last 7 days', closedWeek.length, undefined, 'ok'],
  ];

  return (
    <>
      <div className="day-head">
        <div>
          <p className="eyebrow">Your maintenance workspace</p>
          <h1 className="day-title">Today</h1>
          <p className="day-date">{longDate(today)}</p>
          <p className="day-summary" data-testid="day-summary">
            {summary}
            {filtered && <span className="filtered-note"> · filtered: {[describeView(f), focusCards.find((c) => c.key === focus)?.label].filter(Boolean).join(', ')}</span>}
            {props.storageNote}
          </p>
        </div>
        <div className="day-actions">
          <button type="button" className="btn" onClick={props.onReport}>
            <FileText className="icon" /> Export report
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onAdd}>
            <Plus className="icon" /> Add task
          </button>
        </div>
      </div>

      <div className="focus-cards" aria-label="Task priorities">
        {focusCards.map((c) => <button key={c.key} type="button" className={`focus-card ${c.tone}`} aria-pressed={focus === c.key} onClick={() => { setF(NO_FILTER); setFocus(focus === c.key ? '' : c.key); }}>
          <span>{c.label}</span><strong>{allOpen.filter((t) => matchesFocus(t, c.key, today)).length}</strong><small>{c.hint}</small>
        </button>)}
      </div>
      <div className="today-grid">
        <div className="today-main">
          <details className="quick-entry"><summary><Plus className="icon" aria-hidden="true" /> Quick add a task</summary><QuickAdd today={today} onAdd={props.onQuickAdd} /></details>
          <FilterBar f={f} set={setF} tasks={props.tasks} contacts={contacts} />
          <div className="list-tools"><span>{openTotal} open task{openTotal === 1 ? '' : 's'}{focus && <> · {focusCards.find((c) => c.key === focus)?.label} <button type="button" className="linkish" onClick={() => setFocus('')}>Show all</button></>}</span><TaskSort value={sort} onChange={setSort} /></div>

          {MAIN_GROUPS.map((g) => {
            const items = list[g.key];
            if (g.key !== 'attention' && items.length === 0) return null;
            const head = (
              <>
                <span>{g.title}</span>
                <span className="group-count" data-testid={`count-${g.key}`}>
                  {items.length}
                </span>
              </>
            );
            if (g.collapsed)
              return (
                <details className="group" key={g.key} data-testid={`group-${g.key}`}>
                  <summary className="group-head">{head}</summary>
                  {renderItems(items)}
                </details>
              );
            return (
              <section className={`group ${g.tone ?? ''}`} key={g.key} data-testid={`group-${g.key}`} aria-label={g.title}>
                <h2 className="group-head">{head}</h2>
                {g.hint && <p className="group-hint">{g.hint}</p>}
                {items.length === 0 ? (
                  <p className="empty all-clear">
                    <CheckCircle2 className="icon" />
                    {attentionEmpty}
                  </p>
                ) : (
                  renderItems(items)
                )}
              </section>
            );
          })}
        </div>

        <aside className="today-side" aria-label="Overview and long-term work">
          <section className="side-card overview" aria-label="Overview">
            <h2 className="side-title">At a glance{filtered ? ' · filtered' : ''}</h2>
            <dl>
              {overview.map(([label, value, onClick, tone]) => (
                <div key={label} className={`ov-row ${tone ?? ''}${value === 0 ? ' zero' : ''}`}>
                  <dt>{onClick ? <button type="button" className="linkish" onClick={onClick}>{label}</button> : label}</dt>
                  <dd data-testid={`ov-${label}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <details className="side-card group" data-testid="group-longterm" open={list.longterm.length > 0 && list.longterm.length <= 4}>
            <summary className="group-head">
              <span>Long-term work</span>
              <span className="group-count" data-testid="count-longterm">
                {list.longterm.length}
              </span>
            </summary>
            {list.longterm.length === 0 && <p className="subtle">No long-term work without a near date.</p>}
            {list.longterm.map((i) => (
              <div className="lt-item" key={i.task.id}>
                <button type="button" className="project-title" onClick={() => props.onOpen(i.task)}>
                  {i.task.title}
                </button>
                {i.task.nextAction && <p className="lt-next">Next: {i.task.nextAction}</p>}
                <p className="subtle">
                  {i.task.milestoneDate ? `Milestone ${shortDate(i.task.milestoneDate, today)}` : 'No milestone date'}
                  {i.task.blocker ? ' · Blocked' : ''}
                </p>
              </div>
            ))}
          </details>

          {done.length > 0 && (
            <details className="side-card group done-group">
              <summary className="group-head">
                <span>Done today</span>
                <span className="group-count">{done.length}</span>
              </summary>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} contacts={contacts} today={today} onOpen={props.onOpen} onToggle={props.onToggle} />
              ))}
            </details>
          )}

          {props.outlookSlot}
        </aside>
      </div>
    </>
  );
}
