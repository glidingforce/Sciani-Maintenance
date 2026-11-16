import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Contact, Task } from '../types';
import { STATUS_LABEL } from '../types';
import { DEFAULT_FILTERS, reportCounts, reportOptions, selectClosedTasks, selectReportTasks, type ReportFilters } from '../lib/report';
import { downloadBlob } from '../lib/download';
import { Sheet } from './Sheet';

/** Management report: PDF of unfinished tasks. Contact details and internal notes are never included. */
export function ReportDialog(props: { tasks: Task[]; contacts: Contact[]; today: string; onClose: () => void }) {
  const [f, setF] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const opts = useMemo(() => reportOptions(props.tasks, props.contacts), [props.tasks, props.contacts]);
  const selected = selectReportTasks(props.tasks, props.contacts, f, props.today);
  const c = reportCounts(selected, props.today);
  const closed = selectClosedTasks(props.tasks, props.contacts, f, props.today);
  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => setF((x) => ({ ...x, [k]: v }));

  async function make() {
    setBusy(true);
    setMsg('');
    try {
      // Loaded on demand: the PDF engine and fonts are only needed here.
      const { buildReport } = await import('../report/pdf');
      const r = await buildReport(props.tasks, props.contacts, f, props.today);
      downloadBlob(r.blob, r.fileName);
      setMsg(`Created ${r.fileName}: ${r.rowCount} open and ${r.closedCount} closed tasks on ${r.pages} pages.`);
    } catch (e) {
      setMsg(`The report could not be created: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Export report (PDF)"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => setF(DEFAULT_FILTERS)}>
            Clear filters
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void make()}>
            <FileText className="icon" /> {busy ? 'Creating…' : 'Create PDF'}
          </button>
        </>
      }
    >
      <div className="form">
        <p data-testid="report-preview">
          <b>{c.open}</b> unfinished tasks: {c.overdue} overdue, {c.high} high priority, {c.waiting} waiting, {c.blocked} blocked. Plus{' '}
          <b>{closed.length}</b> closed in the last 7 days (on a separate page).
        </p>
        <div className="grid2">
          <label className="field">
            <span>Area / room</span>
            <select value={f.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">All areas</option>
              {opts.areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Responsible</span>
            <select value={f.responsible} onChange={(e) => set('responsible', e.target.value)}>
              <option value="">Everyone</option>
              {opts.responsible.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={f.priority} onChange={(e) => set('priority', e.target.value as ReportFilters['priority'])}>
              <option value="">All priorities</option>
              <option>High</option>
              <option>Normal</option>
              <option>Low</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={f.status} onChange={(e) => set('status', e.target.value as ReportFilters['status'])}>
              <option value="all">All unfinished</option>
              <option value="todo">{STATUS_LABEL.todo}</option>
              <option value="in_progress">{STATUS_LABEL.in_progress}</option>
              <option value="waiting">{STATUS_LABEL.waiting}</option>
              <option value="blocked">Blocked (blocker recorded)</option>
              <option value="longterm">Long-term work</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Work due on or before (optional)</span>
          <input type="date" value={f.dueBy} onChange={(e) => set('dueBy', e.target.value)} />
        </label>
        {f.dueBy && <p className="error-text">With a due-date filter, tasks that have no due date are left out of the report.</p>}
        <p className="subtle">
          Open tasks: title, equipment, room, area, responsible, status, priority, work due date, opened date and days open, next action,
          follow-up date, blocker and management action. Then a separate page of tasks closed in the last 7 days.
          Contact phone numbers, e-mails and internal notes are not included.
        </p>
        {msg && <p role="status">{msg}</p>}
      </div>
    </Sheet>
  );
}
