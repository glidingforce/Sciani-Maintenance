import { useState } from 'react';
import type { Contact, ContactType, Kind, Owner, Priority, Status, Task } from '../types';
import { CONTACT_TYPES, PRIORITIES, STATUSES, STATUS_LABEL } from '../types';
import { complete, newContact, reopen, setArchived } from '../lib/tasks';
import { Segmented, Sheet } from './Sheet';

export interface EditorActions {
  saveTask: (t: Task) => Promise<boolean>;
  saveContact: (c: Contact) => Promise<boolean>;
  logFollowUp?: (t: Task) => void;
  schedule?: (t: Task) => void;
}

export function TaskEditor(props: {
  task: Task;
  isNew: boolean;
  contacts: Contact[];
  onClose: () => void;
  actions: EditorActions;
}) {
  const [t, setT] = useState<Task>(props.task);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newContactDraft, setNewContactDraft] = useState<{ name: string; company: string; type: ContactType; phone: string; email: string } | null>(null);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const opt = (v: string) => (v.trim() ? v : undefined);
  const hasDetails = !!(t.area || t.requester || t.notes || t.nextFollowUp || (t.owner === 'me' && t.contactId));

  async function commit(next: Task, close = true) {
    if (!next.title.trim()) return setError('Give the task a title.');
    if (next.kind === 'project' && !next.nextAction?.trim()) return setError('Long-term work needs a next action.');
    setBusy(true);
    setError('');
    let toSave = { ...next, title: next.title.trim(), updatedAt: new Date().toISOString() };
    if (newContactDraft?.name.trim()) {
      const c = newContact({
        name: newContactDraft.name.trim(),
        company: opt(newContactDraft.company),
        type: newContactDraft.type,
        phone: opt(newContactDraft.phone),
        email: opt(newContactDraft.email),
      });
      if (!(await props.actions.saveContact(c))) {
        setBusy(false);
        return setError('The new contact was not saved, so the task was not saved either.');
      }
      toSave = { ...toSave, contactId: c.id };
      setNewContactDraft(null);
    }
    const ok = await props.actions.saveTask(toSave);
    setBusy(false);
    if (!ok) return setError('Not saved. Check the message at the bottom of the screen and try again.');
    setT(toSave);
    if (close) props.onClose();
  }

  const contactSelect = (
    <label className="field">
      <span>Contractor / vendor contact</span>
      <select
        value={newContactDraft ? '__new' : t.contactId ?? ''}
        onChange={(e) => {
          if (e.target.value === '__new') {
            setNewContactDraft({ name: '', company: '', type: 'Contractor', phone: '', email: '' });
          } else {
            setNewContactDraft(null);
            set('contactId', e.target.value || undefined);
          }
        }}
      >
        <option value="">None</option>
        {props.contacts
          .slice()
          .sort((a, b) => (a.company ?? a.name).localeCompare(b.company ?? b.name))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.company ? `${c.company} · ${c.name}` : c.name}
            </option>
          ))}
        <option value="__new">+ New contact…</option>
      </select>
    </label>
  );

  const newContactFields = newContactDraft && (
    <div className="form linked" style={{ background: 'var(--pale)' }}>
      <div className="grid2">
        <label className="field">
          <span>Contact name</span>
          <input value={newContactDraft.name} onChange={(e) => setNewContactDraft({ ...newContactDraft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Company</span>
          <input value={newContactDraft.company} onChange={(e) => setNewContactDraft({ ...newContactDraft, company: e.target.value })} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" value={newContactDraft.phone} onChange={(e) => setNewContactDraft({ ...newContactDraft, phone: e.target.value })} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={newContactDraft.type} onChange={(e) => setNewContactDraft({ ...newContactDraft, type: e.target.value as ContactType })}>
            {CONTACT_TYPES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  const footer = props.isNew ? (
    <>
      <button type="button" className="btn" onClick={props.onClose}>
        Cancel
      </button>
      <button type="submit" form="task-form" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save task'}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => commit(t.status === 'done' ? reopen(t) : complete(t))}>
        {t.status === 'done' ? 'Reopen' : 'Complete'}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => commit(setArchived(t, !t.archived))}>
        {t.archived ? 'Restore' : 'Archive'}
      </button>
      {props.actions.logFollowUp && (
        <button type="button" className="btn" onClick={() => props.actions.logFollowUp!(t)}>
          Log follow-up
        </button>
      )}
      {props.actions.schedule && t.status !== 'done' && (
        <button type="button" className="btn" onClick={() => props.actions.schedule!(t)}>
          {t.outlook?.state === 'scheduled' ? 'Reschedule' : 'Schedule in Outlook'}
        </button>
      )}
      <span className="grow" />
      <button type="submit" form="task-form" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  return (
    <Sheet title={props.isNew ? 'New task' : t.kind === 'project' ? 'Long-term work' : 'Task'} onClose={props.onClose} footer={footer}>
      <form
        id="task-form"
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void commit(t);
        }}
      >
        <Segmented<Kind>
          label="Type"
          value={t.kind}
          options={[
            { value: 'task', label: 'Task' },
            { value: 'project', label: 'Long-term' },
          ]}
          onChange={(v) => set('kind', v)}
        />
        <label className="field">
          <span>Title</span>
          <input
            autoFocus={props.isNew}
            value={t.title}
            maxLength={160}
            placeholder={t.kind === 'project' ? 'e.g. Annual shutdown planning' : 'What needs to be done?'}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        {t.kind === 'project' && (
          <label className="field">
            <span>Next action</span>
            <input value={t.nextAction ?? ''} maxLength={200} onChange={(e) => set('nextAction', opt(e.target.value))} />
          </label>
        )}
        <Segmented<Priority>
          label="Priority"
          value={t.priority}
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          onChange={(v) => set('priority', v)}
        />
        <div className="grid2">
          {t.kind === 'task' ? (
            <label className="field">
              <span>Due date</span>
              <input type="date" value={t.dueDate ?? ''} onChange={(e) => set('dueDate', opt(e.target.value))} />
            </label>
          ) : (
            <label className="field">
              <span>Milestone date (optional)</span>
              <input type="date" value={t.milestoneDate ?? ''} onChange={(e) => set('milestoneDate', opt(e.target.value))} />
            </label>
          )}
          <label className="field">
            <span>Status</span>
            <select value={t.status} onChange={(e) => set('status', e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Segmented<Owner>
          label="Who is doing it"
          value={t.owner}
          options={[
            { value: 'me', label: 'Me' },
            { value: 'other', label: 'Someone else' },
          ]}
          onChange={(v) => set('owner', v)}
        />
        {t.owner === 'other' && (
          <>
            <label className="field">
              <span>Name or team (optional if a contact is linked)</span>
              <input value={t.assignee ?? ''} onChange={(e) => set('assignee', opt(e.target.value))} />
            </label>
            {contactSelect}
            {newContactFields}
            <label className="field">
              <span>Next follow-up</span>
              <input type="date" value={t.nextFollowUp ?? ''} onChange={(e) => set('nextFollowUp', opt(e.target.value))} />
            </label>
          </>
        )}
        <details className="more-fields" open={!props.isNew && hasDetails}>
          <summary>More details</summary>
          <div className="more-grid">
            <div className="grid2">
              <label className="field">
                <span>Area / equipment</span>
                <input value={t.area ?? ''} placeholder="e.g. Production · AHU-02" onChange={(e) => set('area', opt(e.target.value))} />
              </label>
              <label className="field">
                <span>Requested by</span>
                <input value={t.requester ?? ''} placeholder="e.g. QA" onChange={(e) => set('requester', opt(e.target.value))} />
              </label>
            </div>
            {t.owner === 'me' && (
              <>
                {contactSelect}
                {newContactFields}
                <label className="field">
                  <span>Next follow-up</span>
                  <input type="date" value={t.nextFollowUp ?? ''} onChange={(e) => set('nextFollowUp', opt(e.target.value))} />
                </label>
              </>
            )}
            <label className="field">
              <span>Notes</span>
              <textarea value={t.notes ?? ''} maxLength={4000} onChange={(e) => set('notes', opt(e.target.value))} />
            </label>
          </div>
        </details>
        {t.outlook && (
          <div className={`linked${t.outlook.state === 'removed' ? ' removed' : ''}`}>
            {t.outlook.state === 'scheduled' && t.outlook.start
              ? `In Outlook: ${t.outlook.start.slice(0, 10)} ${t.outlook.start.slice(11, 16)}–${t.outlook.end?.slice(11, 16)} (Israel time)`
              : t.outlook.state === 'removed'
                ? 'This task is no longer scheduled: its Outlook event was deleted or cancelled.'
                : 'Outlook scheduling was started but not confirmed. Scheduling again will not create a duplicate.'}
            {t.outlook.webLink && t.outlook.state === 'scheduled' && (
              <>
                {' · '}
                <a href={t.outlook.webLink} target="_blank" rel="noreferrer">
                  Open in Outlook
                </a>
              </>
            )}
          </div>
        )}
        {t.followUps.length > 0 && (
          <div>
            <span className="legend">Follow-up log</span>
            <ul className="history">
              {[...t.followUps].reverse().map((f) => (
                <li key={f.id}>
                  <b>{f.date}</b>
                  {f.note || 'No note'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
