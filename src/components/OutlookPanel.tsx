import { RefreshCw } from 'lucide-react';
import type { Outlook } from '../state/useOutlook';
import { longDate, todayISO, wallClockDate, wallClockTime } from '../lib/dates';

/** Disconnected: one small entry. Connected: a simple upcoming agenda. Never an empty calendar. */
export function OutlookPanel({ outlook, onSetupInfo }: { outlook: Outlook; onSetupInfo: () => void }) {
  const s = outlook.status;

  if (s !== 'connected') {
    const text =
      s === 'expired'
        ? 'Sign-in expired'
        : s === 'initializing'
          ? 'Checking…'
          : s === 'error'
            ? 'Connection problem'
            : 'Not connected';
    return (
      <div className="outlook" data-testid="outlook-entry">
        <div className="outlook-row">
          <span className="outlook-status">
            <b>Outlook 365</b> · {text}
          </span>
          {s === 'not-configured' ? (
            <button type="button" className="linkish" onClick={onSetupInfo}>
              Connect Outlook
            </button>
          ) : s !== 'initializing' ? (
            <button type="button" className="linkish" onClick={outlook.connect}>
              {s === 'expired' ? 'Sign in again' : 'Connect Outlook'}
            </button>
          ) : null}
        </div>
        {outlook.error && <p className="error-text">{outlook.error}</p>}
      </div>
    );
  }

  const today = todayISO();
  const groups = new Map<string, typeof outlook.agenda>();
  for (const e of outlook.agenda) {
    const d = wallClockDate(e.start);
    groups.set(d, [...(groups.get(d) ?? []), e]);
  }

  return (
    <section className="outlook" aria-label="Outlook agenda">
      <div className="outlook-row">
        <h2 className="label">Outlook · next 7 days</h2>
        <span className="outlook-status">
          {outlook.refreshedAt ? `Updated ${outlook.refreshedAt.toTimeString().slice(0, 5)}` : ''}
          <button type="button" className="icon-btn" aria-label="Refresh Outlook" onClick={() => void outlook.refresh()} disabled={outlook.busy}>
            <RefreshCw className="icon" />
          </button>
        </span>
      </div>
      {outlook.error && <p className="error-text">{outlook.error}</p>}
      {outlook.agenda.length === 0 && !outlook.busy && <p className="empty">No appointments in the next 7 days.</p>}
      {[...groups.entries()].map(([day, items]) => (
        <div key={day}>
          <div className="agenda-day">{day === today ? 'Today' : longDate(day)}</div>
          <ul className="agenda">
            {items.map((e) => (
              <li key={e.id}>
                <span className="time">{e.isAllDay ? 'All day' : `${wallClockTime(e.start)}–${wallClockTime(e.end)}`}</span>
                <span>
                  {e.webLink ? (
                    <a href={e.webLink} target="_blank" rel="noreferrer">
                      {e.subject}
                    </a>
                  ) : (
                    e.subject
                  )}
                  {e.location && <span className="subtle"> · {e.location}</span>}
                  {e.type !== 'singleInstance' && <span className="subtle"> · recurring</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
