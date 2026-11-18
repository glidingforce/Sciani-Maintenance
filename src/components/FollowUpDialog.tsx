import { useState } from 'react';
import { Mail, Phone } from 'lucide-react';
import type { Contact, Task } from '../types';
import { addDays } from '../lib/dates';
import { logFollowUp } from '../lib/tasks';
import { Sheet } from './Sheet';

export function ContactLinks({ contact, subject }: { contact?: Contact; subject?: string }) {
  if (!contact) return null;
  return (
    <>
      {contact.phone && (
        <a className="pill" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${contact.name}`}>
          <Phone className="icon" width={14} height={14} /> Call
        </a>
      )}
      {contact.email && (
        <a
          className="pill"
          href={`mailto:${contact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}
          aria-label={`Email ${contact.name}`}
        >
          <Mail className="icon" width={14} height={14} /> Email
        </a>
      )}
    </>
  );
}

/** Logs a follow-up and sets the next date. The task's status is left as it is. */
export function FollowUpDialog(props: {
  task: Task;
  contact?: Contact;
  today: string;
  onSave: (t: Task) => Promise<boolean>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(props.today);
  const [note, setNote] = useState('');
  const [next, setNext] = useState(addDays(props.today, 3));
  const [nextAction, setNextAction] = useState(props.task.nextAction ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = props.contact;

  async function submit() {
    setBusy(true);
    const logged = logFollowUp(props.task, { date, note, next: next || undefined });
    const ok = await props.onSave({ ...logged, nextAction: nextAction.trim() || undefined });
    setBusy(false);
    if (ok) props.onClose();
    else setError('Not saved. Try again.');
  }

  return (
    <Sheet
      title="Log update"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" form="fu-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save update'}
          </button>
        </>
      }
    >
      <form
        id="fu-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <p style={{ fontWeight: 700 }}>{props.task.title}</p>
          {c && (
            <p className="subtle">
              {c.company ? `${c.company} · ` : ''}
              {c.name}
              {c.phone ? ` · ${c.phone}` : ''}
              {c.email ? ` · ${c.email}` : ''}
            </p>
          )}
          {c && (c.phone || c.email) && (
            <div className="wait-actions" style={{ marginTop: 8 }}>
              <ContactLinks contact={c} subject={props.task.title} />
            </div>
          )}
        </div>
        <div className="grid2">
          <label className="field">
            <span>Date of update</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Next follow-up</span>
            <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Outcome</span>
          <input value={note} maxLength={300} placeholder="e.g. Visit confirmed for Thursday" onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field">
          <span>Next action</span>
          <input value={nextAction} maxLength={200} placeholder="e.g. Meet technician at the chiller" onChange={(e) => setNextAction(e.target.value)} />
        </label>
        <p className="subtle">This keeps the record open. Clear “Next follow-up” if none is needed.</p>
        {error && <p className="error-text">{error}</p>}
      </form>
    </Sheet>
  );
}
