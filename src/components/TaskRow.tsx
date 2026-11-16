import { Check, CalendarClock } from 'lucide-react';
import type { Contact, Task } from '../types';
import { STATUS_LABEL } from '../types';
import { relativeDate, wallClockDate, wallClockTime, shortDate } from '../lib/dates';
import { isOverdue, ownerLabel } from '../lib/tasks';

export function TaskRow(props: {
  task: Task;
  contacts: Contact[];
  today: string;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
}) {
  const { task: t, today } = props;
  const done = t.status === 'done';
  const overdue = isOverdue(t, today);
  const context = [t.area, t.requester && `Requested by ${t.requester}`].filter(Boolean).join(' · ');
  return (
    <div className={`task${done ? ' done' : ''}`} data-testid="task-row">
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
          {(t.status === 'in_progress' || t.status === 'waiting') && <span className="tag">{STATUS_LABEL[t.status]}</span>}
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
        <span className={`priority ${t.priority}`}>{t.priority}</span>
        {t.dueDate ? (
          <span className={`due${overdue ? ' overdue' : ''}`}>
            {overdue ? `Overdue · ${shortDate(t.dueDate, today)}` : relativeDate(t.dueDate, today)}
          </span>
        ) : (
          <span className="due">No date</span>
        )}
      </div>
    </div>
  );
}
