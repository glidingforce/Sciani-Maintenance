import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { canSignIn, outlookConfigured } from '../config';
import { todayISO, GRAPH_TIME_ZONE } from '../lib/dates';
import { uid } from '../lib/tasks';
import { SignInRequired, currentAccount, getToken, initAuth, signIn } from '../auth/msal';
import {
  GraphError,
  deleteLinkedEvent,
  fetchAgenda,
  linkChanged,
  refreshLink,
  scheduledTasks,
  upsertEvent,
  type AgendaItem,
  type ScheduleInput,
} from '../outlook/graph';

export type OutlookStatus =
  | 'not-configured' // no app registration values in the build
  | 'initializing'
  | 'disconnected'
  | 'connected'
  | 'expired' // tokens can no longer be refreshed silently
  | 'error';

const deps = { getToken };

function describe(e: unknown): string {
  if (e instanceof GraphError) {
    if (e.status === 403) return 'Outlook refused access (403). Your organization may require admin approval for this app.';
    if (e.status === 401) return 'Outlook sign-in is no longer valid.';
    return `Outlook error: ${e.message}`;
  }
  if (e instanceof TypeError) return 'Could not reach Outlook. Check your connection.';
  return e instanceof Error ? e.message : String(e);
}

/** Agenda + task/event links. Refreshes on open, on return to the app, and on demand.
 * A static site cannot run while closed, so nothing syncs in the background. */
export function useOutlook(tasks: Task[], saveTask: (t: Task) => Promise<boolean>, enabled: boolean) {
  const [status, setStatus] = useState<OutlookStatus>(outlookConfigured && canSignIn() ? 'initializing' : 'not-configured');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (!outlookConfigured || !canSignIn()) return;
    initAuth()
      .then((acc) => setStatus(acc ? 'connected' : 'disconnected'))
      .catch((e) => {
        setStatus('error');
        setError(describe(e));
      });
  }, []);

  const handle = useCallback((e: unknown) => {
    if (e instanceof SignInRequired || (e instanceof GraphError && e.status === 401)) {
      setStatus('expired');
      setError('');
    } else {
      setError(describe(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (status !== 'connected' || !enabled) return;
    setBusy(true);
    setError('');
    try {
      setAgenda(await fetchAgenda(deps, todayISO()));
      for (const t of scheduledTasks(tasksRef.current)) {
        const next = await refreshLink(deps, t.outlook!);
        if (linkChanged(t.outlook, next)) await saveTask({ ...t, outlook: next, updatedAt: new Date().toISOString() });
      }
      setRefreshedAt(new Date());
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  }, [status, enabled, saveTask, handle]);

  // On open (once connected and data is loaded), and whenever the app becomes visible again.
  useEffect(() => {
    if (status !== 'connected' || !enabled) return;
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Explicitly schedule (or reschedule) one task as an Outlook event. */
  const schedule = useCallback(
    async (task: Task, input: ScheduleInput): Promise<boolean> => {
      setBusy(true);
      setError('');
      try {
        let current = task;
        // Persist a transaction id before the first create so retries are idempotent.
        if (!current.outlook || current.outlook.state === 'removed') {
          current = {
            ...current,
            outlook: { transactionId: uid(), timeZone: GRAPH_TIME_ZONE, state: 'pending' },
            updatedAt: new Date().toISOString(),
          };
          if (!(await saveTask(current))) return false;
        }
        const link = await upsertEvent(deps, current.outlook!, input);
        const ok = await saveTask({ ...current, outlook: link, updatedAt: new Date().toISOString() });
        if (!ok) setError('The Outlook event exists, but linking it to the task was not saved. Scheduling again will update the same event.');
        void refreshAgendaOnly();
        return ok;
      } catch (e) {
        handle(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [saveTask, handle], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unschedule = useCallback(
    async (task: Task): Promise<boolean> => {
      if (!task.outlook) return true;
      setBusy(true);
      setError('');
      try {
        if (task.outlook.state === 'scheduled') await deleteLinkedEvent(deps, task.outlook);
        const ok = await saveTask({ ...task, outlook: undefined, updatedAt: new Date().toISOString() });
        void refreshAgendaOnly();
        return ok;
      } catch (e) {
        handle(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [saveTask, handle], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function refreshAgendaOnly() {
    try {
      setAgenda(await fetchAgenda(deps, todayISO()));
    } catch (e) {
      handle(e);
    }
  }

  return {
    status,
    agenda,
    error,
    busy,
    refreshedAt,
    account: status === 'connected' ? currentAccount() : null,
    connect: () => signIn().catch((e) => setError(describe(e))),
    refresh,
    schedule,
    unschedule,
  };
}

export type Outlook = ReturnType<typeof useOutlook>;
