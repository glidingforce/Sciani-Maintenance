import { useState } from 'react';
import { CheckCircle2, FileText, Plus } from 'lucide-react';
import type { Contact, Priority, Task } from '../types';
import { addDays, longDate } from '../lib/dates';
import { dailyList, doneToday, newTask, type DailyGroup, type DailyItem, type OwnerFilter, type QuickAction } from '../lib/tasks';
import { DailyRow, TaskRow } from './TaskRow';

function QuickAdd({ today, onAdd }: { today: string; onAdd: (t: Task) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'week' | 'none' | 'pick'>('none');
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [busy, setBusy] = useState(false);
  const due = when === 'pick' ? date || undefined : { today, tomorrow: addDays(today, 1), week: addDays(today, 7), none: undefined }[when];

  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const ok = await onAdd(
          newTask({
            title: title.trim(),
            dueDate: due,
            priority,
            ...(who.trim() ? { owner: 'other' as const, assignee: who.trim() } : {}),
          }),
        );
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
      <div className="quick-controls">
        <select className="input" aria-label="Work due" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="none">No due date</option>
          <option value="today">Due today</option>
          <option value="tomorrow">Due tomorrow</option>
          <option value="week">Due next week</option>
          <option value="pick">Pick a date…</option>
        </select>
        {when === 'pick' && <input className="input" type="date" aria-label="Due date" value={date} onChange={(e) => setDate(e.target.value)} />}
        <input className="input who" aria-label="Responsible (leave empty for me)" placeholder="Who? (me)" value={who} onChange={(e) => setWho(e.target.value)} />
        <button type="button" className={`chip-toggle${priority === 'High' ? ' on' : ''}`} aria-pressed={priority === 'High'} onClick={() => setPriority((p) => (p === 'High' ? 'Normal' : 'High'))}>
          High
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

const GROUPS: { key: DailyGroup; title: string; tone?: string; hint?: string; collapsed?: boolean }[] = [
  { key: 'attention', title: 'Needs attention', tone: 'attention' },
  { key: 'coming', title: 'Coming up · next 7 days' },
  { key: 'unscheduled', title: 'Not scheduled', hint: 'No due date and no follow-up date. Open one to schedule it.' },
  { key: 'later', title: 'Later', collapsed: true },
  { key: 'longterm', title: 'Long-term work', collapsed: true },
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
  const { tasks, contacts, today } = props;
  const [filter, setFilter] = useState<OwnerFilter>('all');
  const list = dailyList(tasks, today, filter);
  const done = doneToday(tasks, today);
  const rowProps = { contacts, today, onOpen: props.onOpen, onToggle: props.onToggle, onQuick: props.onQuick, onLog: props.onLog };
  const n = (g: DailyGroup) => list[g].length;
  const openTotal = GROUPS.reduce((s, g) => s + n(g.key), 0);

  const summary = [
    `${n('attention')} need${n('attention') === 1 ? 's' : ''} attention`,
    n('coming') ? `${n('coming')} coming up` : '',
    n('unscheduled') ? `${n('unscheduled')} not scheduled` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const attentionEmpty =
    openTotal === 0
      ? tasks.length === 0
        ? 'No tasks yet. Type the first one above.'
        : 'No open work. Everything is done.'
      : `Nothing overdue, due today or waiting on a follow-up today.${n('coming') ? ` ${n('coming')} coming up this week.` : ''}${
          n('unscheduled') ? ` ${n('unscheduled')} task${n('unscheduled') > 1 ? 's have' : ' has'} no date yet.` : ''
        }`;

  const renderItems = (items: DailyItem[]) => items.map((i) => <DailyRow key={i.task.id} item={i} {...rowProps} />);

  return (
    <>
      <div className="day-head">
        <div>
          <h1 className="day-title">{longDate(today)}</h1>
          <p className="day-summary" data-testid="day-summary">
            {summary}
            {props.storageNote}
          </p>
        </div>
        <div className="day-actions">
          <button type="button" className="btn" onClick={props.onReport}>
            <FileText className="icon" /> Export report
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onAdd}>
            <Plus className="icon" /> Task
          </button>
        </div>
      </div>

      <QuickAdd today={today} onAdd={props.onQuickAdd} />

      <div className="list-head">
        <div className="filters" role="group" aria-label="Who is doing it">
          {(
            [
              ['all', 'All'],
              ['mine', 'Mine'],
              ['others', 'Others'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((g) => {
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
            <details className={`group ${g.tone ?? ''}`} key={g.key} data-testid={`group-${g.key}`}>
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

      {done.length > 0 && (
        <details className="group done-group">
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
    </>
  );
}
