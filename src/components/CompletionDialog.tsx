import { useState } from 'react';
import type { Task } from '../types';
import type { CompletionDetails } from '../lib/tasks';
import { Sheet } from './Sheet';
import { isPurchasing } from '../lib/categories';

export function CompletionDialog(props: {
  task: Task;
  onConfirm: (details: CompletionDetails) => Promise<boolean>;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [solved, setSolved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const purchasing = isPurchasing(props.task);
  const close = () => { if (!busy) props.onClose(); };
  return <Sheet title={purchasing ? 'Close purchasing follow-up' : 'Complete malfunction'} onClose={close} footer={<>
    <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
    <button type="submit" form="completion-form" className="btn btn-primary" disabled={busy}>
      {busy ? 'Saving…' : purchasing ? 'Close follow-up' : 'Close malfunction'}
    </button>
  </>}>
    <form id="completion-form" className="form" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (busy) return;
      if (!note.trim()) { setError('Enter a few words describing what was done and the outcome.'); return; }
      setBusy(true);
      setError('');
      try {
        if (await props.onConfirm({ note: note.trim(), solved })) props.onClose();
        else setError('The record was not closed. Your description is kept here; try again.');
      } catch {
        setError('The record was not closed. Your description is kept here; try again.');
      } finally { setBusy(false); }
    }}>
      <p className="completion-task" dir="auto">{props.task.title}</p>
      <label className="field">
        <span>{purchasing ? 'What was done and what is the outcome?' : 'What was done and how was it resolved?'}</span>
        <textarea autoFocus required maxLength={2000} rows={4} value={note} disabled={busy}
          aria-invalid={!!error} aria-describedby={error ? 'completion-error' : 'completion-help'}
          placeholder={purchasing ? 'e.g. Purchase order approved and sent to the supplier.' : 'e.g. Replaced the faulty sensor and tested the unit. The alarm cleared.'}
          onChange={(e) => { setNote(e.target.value); setError(''); }} />
      </label>
      <label className="completion-solved"><input type="checkbox" checked={solved} disabled={busy} onChange={(e) => setSolved(e.target.checked)} /> {purchasing ? 'Completed successfully' : 'Solved'}</label>
      <p className="subtle" id="completion-help">{purchasing ? (solved ? 'This follow-up will close as completed. Its description and outcome will appear in the PDF report.' : 'This follow-up will close as not completed. Describe why the request is being closed.') : solved
        ? 'The task will close as solved. The description and outcome will appear in the PDF report.'
        : 'The task will close as not solved. Describe the work done and why the issue remains unresolved.'}</p>
      {error && <p className="error-text" id="completion-error" role="alert">{error}</p>}
    </form>
  </Sheet>;
}
