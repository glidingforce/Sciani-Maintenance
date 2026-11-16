import { useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import type { Contact, Task } from '../types';
import { greeting, longDate, relativeDate, shortDate } from '../lib/dates';
import { dailyCounts, followUps, longTerm, ownerLabel, priorityList, type OwnerFilter } from '../lib/tasks';
import { TaskRow } from './TaskRow';
import { ContactLinks } from './FollowUpDialog';

const LIST_LIMIT = 8;

export function Today(props: {
  tasks: Task[];
  contacts: Contact[];
  today: string;
  firstName: string;
  onAdd: () => void;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  onFollowUp: (t: Task) => void;
  onShowAll: () => void;
  outlookSlot: React.ReactNode;
}) {
  const { tasks, contacts, today } = props;
  const [filter, setFilter] = useState<OwnerFilter>('all');
  const counts = dailyCounts(tasks, today);
  const list = priorityList(tasks, today, filter);
  const fus = followUps(tasks, today);
  const projects = longTerm(tasks);
  const contactOf = (t: Task) => contacts.find((c) => c.id === t.contactId);

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
            {props.firstName ? `, ${props.firstName}` : ''}. Start with what matters.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={props.onAdd}>
          <Plus className="icon" /> Task
        </button>
      </div>

      <div className="stats" aria-label="Today in numbers">
        <div className="stat">
          <b data-testid="count-high">{counts.high}</b>
          <span>High priority</span>
        </div>
        <div className="stat">
          <b data-testid="count-today">{counts.dueToday}</b>
          <span>Due today</span>
        </div>
        {counts.overdue > 0 && (
          <div className="stat overdue">
            <b data-testid="count-overdue">{counts.overdue}</b>
            <span>Overdue</span>
          </div>
        )}
        <div className="stat">
          <b data-testid="count-others">{counts.withOthers}</b>
          <span>With others</span>
        </div>
      </div>

      <div className="columns">
        <section aria-labelledby="h-priorities">
          <div className="section-head">
            <h2 id="h-priorities" className="label">
              Priorities
            </h2>
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
          {list.length === 0 && (
            <p className="empty">
              {tasks.length === 0 ? 'No tasks yet. Use “+ Task” to capture the first one.' : 'Nothing open here.'}
            </p>
          )}
          {list.slice(0, LIST_LIMIT).map((t) => (
            <TaskRow key={t.id} task={t} contacts={contacts} today={today} onOpen={props.onOpen} onToggle={props.onToggle} />
          ))}
          {list.length > LIST_LIMIT && (
            <div className="more">
              <button type="button" className="linkish" onClick={props.onShowAll}>
                Show all {list.length} open tasks
              </button>
            </div>
          )}
        </section>

        <section aria-labelledby="h-follow">
          <div className="section-head">
            <h2 id="h-follow" className="label">
              Follow up
            </h2>
          </div>
          {fus.length === 0 && <p className="empty">No follow-ups due this week.</p>}
          {fus.map((t) => {
            const c = contactOf(t);
            const overdue = t.nextFollowUp! < today;
            return (
              <article className="wait" key={t.id} data-testid="follow-up">
                <button type="button" className="wait-title" onClick={() => props.onOpen(t)}>
                  {c?.company || c?.name || ownerLabel(t, contacts)}
                </button>
                <p>
                  {t.title} ·{' '}
                  <span className={`when${overdue ? ' overdue' : ''}`}>
                    {overdue ? `Overdue since ${shortDate(t.nextFollowUp!, today)}` : `Follow up ${relativeDate(t.nextFollowUp!, today).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())}`}
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
        </section>
      </div>

      {projects.slice(0, 3).map((p) => (
        <section className="project" key={p.id} aria-label="Long-term focus">
          <Flag className="icon project-icon" width={20} height={20} />
          <div className="project-body">
            <div className="project-label">Long-term focus</div>
            <button type="button" className="project-title" onClick={() => props.onOpen(p)}>
              {p.title}
            </button>
            <p>Next: {p.nextAction}</p>
          </div>
          {p.milestoneDate && <span className="project-date">{shortDate(p.milestoneDate, today)}</span>}
        </section>
      ))}
      {projects.length > 3 && (
        <p className="subtle" style={{ marginTop: 8 }}>
          {projects.length - 3} more long-term items in All tasks.
        </p>
      )}

      {props.outlookSlot}
    </>
  );
}
