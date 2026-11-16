import { useEffect, useRef, useState } from 'react';
import { Check, CalendarClock, MoreHorizontal } from 'lucide-react';
import type { Contact, Task } from '../types';
import { STATUS_LABEL } from '../types';
import { relativeDate, wallClockDate, wallClockTime, shortDate } from '../lib/dates';
import { isOverdue, ownerLabel, type QuickAction } from '../lib/tasks';

function RowMenu({ task, onQuick, onOpen }: { task: Task; onQuick: (a: QuickAction) => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const item = (label: string, action: QuickAction) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onQuick(action);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="row-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn row-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Quick actions for “${task.title}”`}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="icon" />
      </button>
      {open && (
        <div className="menu" role="menu">
          {task.status !== 'in_progress' && item('Start working on it', 'start')}
          {task.status !== 'waiting' && item('Waiting on someone', 'waiting')}
          {task.status !== 'todo' && item('Back to “To do”', 'todo')}
          <hr />
          {item('Move to tomorrow', 'tomorrow')}
          {item('Move to next week', 'nextweek')}
          <hr />
          {task.priority !== 'High' ? item('Make it High priority', 'high') : item('Set to Normal priority', 'normal')}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
          >
            Edit details…
          </button>
        </div>
      )}
    </div>
  );
}

export function TaskRow(props: {
  task: Task;
  contacts: Contact[];
  today: string;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
  onQuick?: (t: Task, a: QuickAction) => void;
}) {
  const { task: t, today } = props;
  const done = t.status === 'done';
  const overdue = isOverdue(t, today);
  const context = [t.area, t.requester && `Requested by ${t.requester}`].filter(Boolean).join(' · ');
  const accent = done ? '' : overdue ? ' accent-overdue' : t.priority === 'High' ? ' accent-high' : '';
  return (
    <div className={`task${done ? ' done' : ''}${accent}${props.onQuick ? ' has-menu' : ''}`} data-testid="task-row">
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” done`}
        onClick={() => props.onToggle(t)}
      >
        <span>{done && <Check className="icon" strokeWidth={3} width={14} height={14} />}</span>
      </button>
      <div className="task-main">
        <button type="button" className="task-title" onClick={() => props.onOpen(t)}>
          {t.title}
        </button>
        <div className="detail">
          <span>{[context, ownerLabel(t, props.contacts)].filter(Boolean).join(' · ')}</span>
          {(t.status === 'in_progress' || t.status === 'waiting') && (
            <span className={`tag status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          )}
          {t.archived && <span className="tag">Archived</span>}
          {t.outlook?.state === 'scheduled' && t.outlook.start && (
            <span className="tag" title="Scheduled in Outlook">
              <CalendarClock className="icon" width={12} height={12} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
              {shortDate(wallClockDate(t.outlook.start), today)} {wallClockTime(t.outlook.start)}
            </span>
          )}
          {t.outlook?.state === 'removed' && <span className="tag warn">Removed from Outlook</span>}
        </div>
      </div>
      <div className="task-side">
        <span className={`priority ${t.priority}`}>
          <i className="dot" aria-hidden="true" />
          {t.priority}
        </span>
        {t.dueDate ? (
          <span className={`due${overdue ? ' overdue' : ''}`}>
            {overdue ? `Overdue · ${shortDate(t.dueDate, today)}` : relativeDate(t.dueDate, today)}
          </span>
        ) : (
          <span className="due">No date</span>
        )}
      </div>
      {props.onQuick && (done ? <span /> : <RowMenu task={t} onQuick={(a) => props.onQuick!(t, a)} onOpen={() => props.onOpen(t)} />)}
    </div>
  );
}
