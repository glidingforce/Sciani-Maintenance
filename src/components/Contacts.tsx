import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Contact, ContactType, Task } from '../types';
import { CONTACT_TYPES } from '../types';
import { isOpen, newContact } from '../lib/tasks';
import { ContactLinks } from './FollowUpDialog';
import { Sheet } from './Sheet';

export function Contacts(props: {
  contacts: Contact[];
  tasks: Task[];
  onSave: (c: Contact) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onOpenTask: (t: Task) => void;
}) {
  const [editing, setEditing] = useState<{ c: Contact; isNew: boolean } | null>(null);
  const sorted = [...props.contacts].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));

  return (
    <>
      <div className="intro" style={{ marginBottom: 8 }}>
        <h1 className="page-title">Contacts</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ c: newContact(), isNew: true })}>
          <Plus className="icon" /> Contact
        </button>
      </div>
      <p className="subtle" style={{ marginBottom: 16 }}>
        Call and Email open your phone or mail app with the details filled in. Nothing is sent automatically.
      </p>
      {sorted.length === 0 && <p className="empty">No contacts yet.</p>}
      {sorted.map((c) => {
        const open = props.tasks.filter((t) => t.contactId === c.id && isOpen(t));
        return (
          <div className="contact" key={c.id}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{c.company || c.name}</div>
              <div className="detail">
                <span>{c.company ? c.name : ''}</span>
                <span className="tag">{c.type}</span>
                {c.phone && <span>{c.phone}</span>}
                {c.email && <span style={{ overflowWrap: 'anywhere' }}>{c.email}</span>}
              </div>
              {open.length > 0 && (
                <div className="detail">
                  {open.map((t) => (
                    <button key={t.id} type="button" className="linkish" onClick={() => props.onOpenTask(t)}>
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="contact-actions">
              <ContactLinks contact={c} />
              <button type="button" className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ c, isNew: false })}>
                <Pencil className="icon" />
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <ContactEditor
          contact={editing.c}
          isNew={editing.isNew}
          linkedOpen={props.tasks.filter((t) => t.contactId === editing.c.id).length}
          onSave={props.onSave}
          onDelete={props.onDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ContactEditor(props: {
  contact: Contact;
  isNew: boolean;
  linkedOpen: number;
  onSave: (c: Contact) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [c, setC] = useState(props.contact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Contact>(k: K, v: Contact[K]) => setC((x) => ({ ...x, [k]: v }));
  const opt = (v: string) => (v.trim() ? v : undefined);

  return (
    <Sheet
      title={props.isNew ? 'New contact' : 'Edit contact'}
      onClose={props.onClose}
      footer={
        <>
          {!props.isNew ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || props.linkedOpen > 0}
              title={props.linkedOpen > 0 ? 'Linked to tasks; unlink them first' : undefined}
              onClick={async () => (await props.onDelete(c.id)) && props.onClose()}
            >
              Delete
            </button>
          ) : (
            <button type="button" className="btn" onClick={props.onClose}>
              Cancel
            </button>
          )}
          <button type="submit" form="contact-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        id="contact-form"
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!c.name.trim()) return setError('Add a name.');
          setBusy(true);
          const ok = await props.onSave({ ...c, name: c.name.trim(), updatedAt: new Date().toISOString() });
          setBusy(false);
          if (ok) props.onClose();
          else setError('Not saved. Try again.');
        }}
      >
        <div className="grid2">
          <label className="field">
            <span>Name</span>
            <input autoFocus={props.isNew} value={c.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="field">
            <span>Company</span>
            <input value={c.company ?? ''} onChange={(e) => set('company', opt(e.target.value))} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={c.type} onChange={(e) => set('type', e.target.value as ContactType)}>
              {CONTACT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phone</span>
            <input type="tel" value={c.phone ?? ''} onChange={(e) => set('phone', opt(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Email (optional)</span>
          <input type="email" value={c.email ?? ''} onChange={(e) => set('email', opt(e.target.value))} />
        </label>
        {props.linkedOpen > 0 && !props.isNew && <p className="subtle">Linked to {props.linkedOpen} task(s), so it can't be deleted.</p>}
        {error && <p className="error-text">{error}</p>}
      </form>
    </Sheet>
  );
}
