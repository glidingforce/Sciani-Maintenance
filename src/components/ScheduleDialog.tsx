import { useState } from 'react';
import type { Task } from '../types';
import { Sheet } from './Sheet';
import type { ScheduleInput } from '../outlook/graph';

function minutesBetween(start: string, end: string) {
  const a = Date.parse(start.slice(0, 19) + 'Z');
  const b = Date.parse(end.slice(0, 19) + 'Z');
  return Math.max(15, Math.round((b - a) / 60000));
}

/** Explicitly put one task (or contractor visit) into Outlook. Times are Israel time. */
export function ScheduleDialog(props: {
  task: Task;
  today: string;
  busy: boolean;
  error: string;
  onSchedule: (input: ScheduleInput) => Promise<boolean>;
  onUnschedule: () => Promise<boolean>;
  onClose: () => void;
}) {
  const link = props.task.outlook?.state === 'scheduled' ? props.task.outlook : undefined;
  const [date, setDate] = useState(link?.start?.slice(0, 10) ?? props.task.dueDate ?? props.today);
  const [time, setTime] = useState(link?.start?.slice(11, 16) ?? '09:00');
  const [duration, setDuration] = useState(link?.start && link.end ? minutesBetween(link.start, link.end) : 60);
  const [subject, setSubject] = useState(link?.subject ?? props.task.title);

  return (
    <Sheet
      title={link ? 'Reschedule in Outlook' : 'Schedule in Outlook'}
      onClose={props.onClose}
      footer={
        <>
          {link ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={props.busy}
              onClick={async () => (await props.onUnschedule()) && props.onClose()}
            >
              Remove event
            </button>
          ) : (
            <button type="button" className="btn" onClick={props.onClose}>
              Cancel
            </button>
          )}
          <button type="submit" form="sched-form" className="btn btn-primary" disabled={props.busy}>
            {props.busy ? 'Working…' : link ? 'Update event' : 'Create event'}
          </button>
        </>
      }
    >
      <form
        id="sched-form"
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await props.onSchedule({ date, startTime: time, durationMinutes: duration, subject: subject.trim() || props.task.title }))
            props.onClose();
        }}
      >
        <label className="field">
          <span>Event title</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Date</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Start (Israel time)</span>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Duration</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
            {![15, 30, 45, 60, 90, 120, 180, 240, 480].includes(duration) && <option value={duration}>{duration} min</option>}
          </select>
        </label>
        <p className="subtle">
          Creates one event in your own Outlook calendar and links it to this task. Changing the event later in Outlook updates the link
          here; it never completes the task.
        </p>
        {props.error && <p className="error-text">{props.error}</p>}
      </form>
    </Sheet>
  );
}
