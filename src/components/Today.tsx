import { useState } from 'react';
import { Flag, Plus, CheckCircle2 } from 'lucide-react';
import type { Contact, Priority, Task } from '../types';
import { addDays, greeting, longDate, relativeDate, shortDate } from '../lib/dates';
import {
  dailyCounts,
  doneToday,
  followUpDue,
  followUps,
  groupForToday,
  isOverdue,
  longTerm,
  morningSummary,
  newTask,
  ownerLabel,
  priorityList,
  type OwnerFilter,
  type QuickAction,
} from '../lib/tasks';
import { TaskRow } from './TaskRow';
import { ContactLinks } from './FollowUpDialog';

type Focus = 'high' | 'today' | 'overdue' | 'others' | null;

const FOCUS_LABEL: Record<Exclude<Focus, null>, string> = {
  high: 'High priority',
  today: 'Due today',
  overdue: 'Overdue',
  others: 'With others',
};

function QuickAdd({ today, onAdd }: { today: string; onAdd: (t: Task) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'week' | 'none'>('today');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [busy, setBusy] = useState(false);
  const due = { today, tomorrow: addDays(today, 1), week: addDays(today, 7), none: undefined }[when];

  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const ok = await onAdd(newTask({ title: title.trim(), dueDate: due, priority }));
        setBusy(false);
        if (ok) {
          setTitle('');
          setPriority('Normal');
        }
      }}
    >
      <label className="sr-only" htmlFor="quick-title">
        Quick add a task
      </label>
      <input
        id="quick-title"
        className="input"
        placeholder="Quick add: type a task and press Enter"
        value={title}
        maxLength={160}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="quick-controls">
        <select className="input" aria-label="Due" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="week">Next week</option>
          <option value="none">No date</option>
        </select>
        <button
          type="button"
          className={`chip-toggle${priority === 'High' ? ' on' : ''}`}
          aria-pressed={priority === 'High'}
          onClick={() => setPriority((p) => (p === 'High' ? 'Normal' : 'High'))}
        >
          High
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function Group(props: {
  title: string;
  tone?: 'overdue' | 'today';
  tasks: Task[];
  rowProps: Omit<React.ComponentProps<typeof TaskRow>, 'task'>;
  collapsible?: boolean;
}) {
  if (!props.tasks.length) return null;
  const rows = props.tasks.map((t) => <TaskRow key={t.id} task={t} {...props.rowProps} />);
  const head = (
    <>
      <span>{props.title}</span>
      <span className="group-count">{props.tasks.length}</span>
    </>
  );
  if (props.collapsible)
    return (
      <details className={`group ${props.tone ?? ''}`}>
        <summary className="group-head">{head}</summary>
        {rows}
      </details>
    );
  return (
    <div className={`group ${props.tone ?? ''}`}>
      <h3 className="group-head">{head}</h3>
      {rows}
    </div>
  );
}

export function Today(props: {
  tasks: Task[];
  contacts: Contact[];
  today: string;
  firstName: string;
  onAdd: () => void;
  onQuickAdd: (t: Task) => Promise<boolean>;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  onQuick: (t: Task, a: QuickAction) => void;
  onFollowUp: (t: Task) => void;
  onShowAll: () => void;
  outlookSlot: React.ReactNode;
}) {
  const { tasks, contacts, today } = props;
  const [filter, setFilter] = useState<OwnerFilter>('all');
  const [focus, setFocus] = useState<Focus>(null);
  const counts = dailyCounts(tasks, today);
  const fus = followUps(tasks, today);
  const fusDue = fus.filter((t) => followUpDue(t, today)).length;
  const projects = longTerm(tasks);
  const done = doneToday(tasks, today);
  const groups = groupForToday(tasks, today, filter);
  const contactOf = (t: Task) => contacts.find((c) => c.id === t.contactId);
  const rowProps = { contacts, today, onOpen: props.onOpen, onToggle: props.onToggle, onQuick: props.onQuick };

  const focused =
    focus &&
    priorityList(tasks, today, focus === 'others' ? 'others' : filter).filter((t) =>
      focus === 'high' ? t.priority === 'High' : focus === 'today' ? t.dueDate === today : focus === 'overdue' ? isOverdue(t, today) : true,
    );

  const tile = (key: Exclude<Focus, null>, value: number, tone = '') => (
    <button
      type="button"
      className={`stat ${tone}${focus === key ? ' active' : ''}`}
      aria-pressed={focus === key}
      onClick={() => setFocus((f) => (f === key ? null : key))}
    >
      <b data-testid={`count-${key === 'today' ? 'today' : key === 'others' ? 'others' : key}`}>{value}</b>
      <span>{FOCUS_LABEL[key]}</span>
    </button>
  );

  const openCount = groups.overdue.length + groups.today.length + groups.soon.length + groups.later.length;

  return (
    <>
      <div className="intro">
        <div>
          <div className="date-label">{longDate(today)}</div>
          <h1 className="title">
            FACILITY
            <span className="subtitle">MAINTENANCE</span>
          </h1>
          <p className="welcome">
            {greeting()}
            {props.firstName ? `, ${props.firstName}` : ''}. <span className="summary">{morningSummary(counts, fusDue)}</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={props.onAdd}>
          <Plus className="icon" /> Task
        </button>
      </div>

      <div className="stats" aria-label="Today in numbers. Select one to show only those tasks.">
        {counts.overdue > 0 && tile('overdue', counts.overdue, 'overdue')}
        {tile('today', counts.dueToday, 'today')}
        {tile('high', counts.high)}
        {tile('others', counts.withOthers)}
      </div>

      <div className="columns">
        <section aria-labelledby="h-priorities">
          <div className="section-head">
            <h2 id="h-priorities" className="label">
              {focus ? FOCUS_LABEL[focus] : 'Priorities'}
            </h2>
            {focus ? (
              <button type="button" className="linkish" onClick={() => setFocus(null)}>
                Show all
              </button>
            ) : (
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
            )}
          </div>

          <QuickAdd today={today} onAdd={props.onQuickAdd} />

          {focused ? (
            focused.length ? (
              focused.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)
            ) : (
              <p className="empty">Nothing here.</p>
            )
          ) : (
            <>
              {openCount === 0 && (
                <p className="empty all-clear">
                  <CheckCircle2 className="icon" />
                  {tasks.length === 0 ? 'No tasks yet. Type one above to get started.' : 'All clear. Nothing open here.'}
                </p>
              )}
              <Group title="Overdue" tone="overdue" tasks={groups.overdue} rowProps={rowProps} />
              <Group title="Today" tone="today" tasks={groups.today} rowProps={rowProps} />
              <Group title="Next 7 days" tasks={groups.soon} rowProps={rowProps} />
              <Group title="Later or no date" tasks={groups.later} rowProps={rowProps} collapsible={groups.later.length > 3} />
            </>
          )}

          {done.length > 0 && (
            <details className="group done-group">
              <summary className="group-head">
                <span>Done today</span>
                <span className="group-count">{done.length}</span>
              </summary>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} {...rowProps} />
              ))}
            </details>
          )}
        </section>

        <section aria-labelledby="h-follow" className="side-col">
          <div className="section-head">
            <h2 id="h-follow" className="label">
              Follow up
            </h2>
          </div>
          {fus.length === 0 && <p className="empty">No follow-ups due this week.</p>}
          {fus.map((t) => {
            const c = contactOf(t);
            const overdue = t.nextFollowUp! < today;
            const due = t.nextFollowUp! <= today;
            return (
              <article className={`wait${due ? ' due' : ''}`} key={t.id} data-testid="follow-up">
                <button type="button" className="wait-title" onClick={() => props.onOpen(t)}>
                  {c?.company || c?.name || ownerLabel(t, contacts)}
                </button>
                <p>
                  {t.title} ·{' '}
                  <span className={`when${overdue ? ' overdue' : ''}`}>
                    {overdue
                      ? `Overdue since ${shortDate(t.nextFollowUp!, today)}`
                      : `Follow up ${relativeDate(t.nextFollowUp!, today).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())}`}
                  </span>
                </p>
                <div className="wait-actions">
                  <button type="button" className="pill" onClick={() => props.onFollowUp(t)}>
                    Log follow-up
                  </button>
                  <ContactLinks contact={c} subject={t.title} />
                </div>
              </article>
            );
          })}

          {projects.length > 0 && (
            <div className="section-head" style={{ marginTop: 26 }}>
              <h2 className="label">Long-term focus</h2>
            </div>
          )}
          {projects.slice(0, 3).map((p) => (
            <section className="project" key={p.id} aria-label="Long-term focus">
              <Flag className="icon project-icon" width={18} height={18} />
              <div className="project-body">
                <button type="button" className="project-title" onClick={() => props.onOpen(p)}>
                  {p.title}
                </button>
                <p>Next: {p.nextAction}</p>
              </div>
              {p.milestoneDate && <span className="project-date">{shortDate(p.milestoneDate, today)}</span>}
            </section>
          ))}
          {projects.length > 3 && (
            <button type="button" className="linkish" onClick={props.onShowAll}>
              {projects.length - 3} more long-term items
            </button>
          )}
        </section>
      </div>

      {props.outlookSlot}
    </>
  );
}
