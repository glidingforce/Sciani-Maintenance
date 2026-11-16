import { useCallback, useEffect, useState } from 'react';
import { Handshake, ListTodo, Sun, User } from 'lucide-react';
import type { Task } from './types';
import { todayISO } from './lib/dates';
import { applyQuick, complete, newTask, reopen, type QuickAction } from './lib/tasks';
import { useWorkspace } from './state/useWorkspace';
import { useOutlook } from './state/useOutlook';
import { Today } from './components/Today';
import { AllTasks } from './components/AllTasks';
import { Contacts } from './components/Contacts';
import { TaskEditor } from './components/TaskEditor';
import { FollowUpDialog } from './components/FollowUpDialog';
import { ScheduleDialog } from './components/ScheduleDialog';
import { OutlookPanel } from './components/OutlookPanel';
import { DataPanel } from './components/DataPanel';
import { SignIn } from './components/SignIn';
import { Sheet } from './components/Sheet';
import { ReportDialog } from './components/ReportDialog';

type Page = 'today' | 'tasks' | 'contacts';
const PAGES: { id: Page; label: string; short: string; Icon: typeof Sun }[] = [
  { id: 'today', label: 'Today', short: 'Today', Icon: Sun },
  { id: 'tasks', label: 'All Tasks', short: 'All Tasks', Icon: ListTodo },
  { id: 'contacts', label: 'Contacts', short: 'Contacts', Icon: Handshake },
];

const pageFromHash = (): Page => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'tasks' || h === 'contacts' ? h : 'today';
};

function nameFrom(source?: string | null) {
  if (!source) return { first: '', initials: '' };
  const words = source.includes('@')
    ? source.split('@')[0].split(/[._-]+/)
    : source.split(/\s+/);
  const clean = words.filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return { first: clean[0] ?? '', initials: clean.slice(0, 2).map((w) => w[0]).join('') };
}

export default function App() {
  const ws = useWorkspace();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [today, setToday] = useState(todayISO());
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Task | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Task | null>(null);
  const [showData, setShowData] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showOutlookSetup, setShowOutlookSetup] = useState(false);

  const outlook = useOutlook(ws.data.tasks, ws.saveTask, ws.load === 'ready' && ws.mode !== 'demo');

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    // Roll "today" over at midnight Israel time, and when returning to the app.
    const tick = () => setToday(todayISO());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const go = (p: Page) => {
    setPage(p);
    history.replaceState(null, '', p === 'today' ? window.location.pathname + window.location.search : `#/${p}`);
    window.scrollTo({ top: 0 });
  };

  // Auto-dismiss the "Saved" confirmation; errors stay until dismissed.
  useEffect(() => {
    if (ws.save.kind !== 'saved') return;
    const id = window.setTimeout(ws.clearSave, 1800);
    return () => window.clearTimeout(id);
  }, [ws.save]); // eslint-disable-line react-hooks/exhaustive-deps

  const quick = useCallback(
    async (t: Task, a: QuickAction) => {
      const next = applyQuick(t, a, today);
      // "Waiting on someone…" opens the task so you can say for whom and for what.
      if ((await ws.saveTask(next)) && a === 'waiting') setEditing({ task: next, isNew: false });
    },
    [ws.saveTask, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggle = useCallback((t: Task) => void ws.saveTask(t.status === 'done' ? reopen(t) : complete(t)), [ws.saveTask]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Saves edits; if the task's title changed and it has a linked event whose
   * subject still matched the old title, the event subject is updated too. */
  const saveFromEditor = useCallback(
    async (next: Task) => {
      const prev = ws.data.tasks.find((t) => t.id === next.id);
      const ok = await ws.saveTask(next);
      const link = next.outlook;
      if (
        ok && prev && link?.state === 'scheduled' && link.start && link.end &&
        prev.title !== next.title && link.subject === prev.title && outlook.status === 'connected'
      ) {
        const mins = Math.round((Date.parse(link.end.slice(0, 19) + 'Z') - Date.parse(link.start.slice(0, 19) + 'Z')) / 60000);
        await outlook.schedule(next, { date: link.start.slice(0, 10), startTime: link.start.slice(11, 16), durationMinutes: mins, subject: next.title });
      }
      return ok;
    },
    [ws, outlook],
  );

  const who = nameFrom(ws.account?.name ?? ws.account?.username);
  const openTask = (t: Task) => setEditing({ task: t, isNew: false });
  const addTask = () => setEditing({ task: newTask(), isNew: true });
  const latest = (t: Task) => ws.data.tasks.find((x) => x.id === t.id) ?? t;

  const header = (
    <header className="top">
      <div className="top-inner">
        <img className="logo" src={`${import.meta.env.BASE_URL}scinai-logo.png`} alt="Scinai" width={132} height={44} />
        <nav className="top-nav" aria-label="Sections">
          {PAGES.map((p) => (
            <button key={p.id} type="button" aria-current={page === p.id ? 'page' : undefined} onClick={() => go(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="top-right">
          <span className={`mode-badge${ws.mode === 'demo' ? ' demo' : ''}`} data-testid="sync-status">
            {ws.mode === 'demo' ? 'Demo data' : ws.mode === 'local' ? 'This device only' : ws.save.kind === 'saving' ? 'Saving…' : 'OneDrive · saved'}
          </span>
          <button type="button" className="person" aria-label="Data and accounts" onClick={() => setShowData(true)}>
            <span>{who.initials || <User className="icon" />}</span>
          </button>
        </div>
      </div>
    </header>
  );

  // Only demo mode gets a banner. Normal storage status stays compact (header and day summary);
  // real problems (failed saves, failed loads) use the error toast or the error screen.
  const notice =
    ws.mode === 'demo' ? (
      <div className="notice-wrap">
        <div className="notice" role="note">
          <b>Demo data.</b> Sample records, kept separate from your real tasks.
          <button type="button" className="linkish" onClick={() => ws.setDemo(false)}>
            Exit demo
          </button>
        </div>
      </div>
    ) : null;

  const storageNote =
    ws.mode === 'local' ? (
      <span className="storage-note">
        {' · '}Saved on this device only{' '}
        <button type="button" className="linkish" onClick={() => (ws.cloudAvailable ? ws.setLocalOnly(false) : setShowData(true))}>
          {ws.cloudAvailable ? 'Sign in to sync' : 'Details'}
        </button>
      </span>
    ) : null;

  let body: React.ReactNode;
  if (ws.load === 'needs-sign-in') {
    body = <SignIn onSignIn={ws.signInCloud} onLocal={() => ws.setLocalOnly(true)} onDemo={() => ws.setDemo(true)} error={ws.authError} />;
  } else if (ws.load === 'loading') {
    body = <p className="center-card subtle" role="status">Loading your tasks…</p>;
  } else if (ws.load === 'error') {
    body = (
      <div className="center-card" role="alert">
        <h1 className="page-title">Couldn't load your tasks</h1>
        <p className="subtle">{ws.loadError}</p>
        <p className="subtle">Nothing was changed. Check your connection and try again.</p>
        <button type="button" className="btn btn-primary" onClick={() => void ws.reload()}>
          Try again
        </button>
      </div>
    );
  } else {
    const common = { contacts: ws.data.contacts, today, onOpen: openTask, onToggle: toggle, onQuick: quick };
    body =
      page === 'today' ? (
        <Today
          {...common}
          tasks={ws.data.tasks}
          storageNote={storageNote}
          onAdd={addTask}
          onReport={() => setShowReport(true)}
          onQuickAdd={ws.saveTask}
          onLog={setFollowUpFor}
          outlookSlot={ws.mode === 'demo' ? null : <OutlookPanel outlook={outlook} onSetupInfo={() => setShowOutlookSetup(true)} />}
        />
      ) : page === 'tasks' ? (
        <AllTasks {...common} tasks={ws.data.tasks} onAdd={addTask} onReport={() => setShowReport(true)} />
      ) : (
        <Contacts contacts={ws.data.contacts} tasks={ws.data.tasks} onSave={ws.saveContact} onDelete={ws.deleteContact} onOpenTask={openTask} />
      );
  }

  return (
    <>
      {header}
      {notice}
      <main className="main">{body}</main>

      {ws.load === 'ready' && (
        <nav className="mobile-nav" aria-label="Sections">
          {PAGES.map(({ id, short, Icon }) => (
            <button key={id} type="button" aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon className="icon" />
              {short}
            </button>
          ))}
        </nav>
      )}

      {editing && (
        <TaskEditor
          key={editing.task.id}
          task={editing.isNew ? editing.task : latest(editing.task)}
          isNew={editing.isNew}
          contacts={ws.data.contacts}
          onClose={() => setEditing(null)}
          actions={{
            saveTask: saveFromEditor,
            saveContact: ws.saveContact,
            logFollowUp: (t) => {
              setEditing(null);
              setFollowUpFor(latest(t));
            },
            schedule:
              outlook.status === 'connected' && ws.mode !== 'demo'
                ? (t) => {
                    setEditing(null);
                    setScheduleFor(latest(t));
                  }
                : undefined,
          }}
        />
      )}
      {followUpFor && (
        <FollowUpDialog
          task={latest(followUpFor)}
          contact={ws.data.contacts.find((c) => c.id === followUpFor.contactId)}
          today={today}
          onSave={ws.saveTask}
          onClose={() => setFollowUpFor(null)}
        />
      )}
      {scheduleFor && (
        <ScheduleDialog
          task={latest(scheduleFor)}
          today={today}
          busy={outlook.busy}
          error={outlook.error}
          onSchedule={(input) => outlook.schedule(latest(scheduleFor), input)}
          onUnschedule={() => outlook.unschedule(latest(scheduleFor))}
          onClose={() => setScheduleFor(null)}
        />
      )}
      {showData && <DataPanel ws={ws} onClose={() => setShowData(false)} />}
      {showReport && <ReportDialog tasks={ws.data.tasks} contacts={ws.data.contacts} today={today} onClose={() => setShowReport(false)} />}
      {showOutlookSetup && (
        <Sheet title="Outlook needs the web address" onClose={() => setShowOutlookSetup(false)}>
          <div className="form">
            <p>Microsoft sign-in, OneDrive storage and the Outlook agenda only work when the app is opened from its web address, not from a file on your computer.</p>
            <p className="subtle">Open https://glidingforce.github.io/Sciani-Maintenance/ and sign in with your Scinai account.</p>
          </div>
        </Sheet>
      )}

      {ws.save.kind !== 'idle' && (
        <div className={`toast${ws.save.kind === 'error' ? ' error' : ''}`} role={ws.save.kind === 'error' ? 'alert' : 'status'}>
          <span>{ws.save.kind === 'saving' ? 'Saving…' : ws.save.kind === 'saved' ? 'Saved' : ws.save.message}</span>
          {ws.save.kind === 'error' && (
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={ws.clearSave}>
              ×
            </button>
          )}
        </div>
      )}
    </>
  );
}
