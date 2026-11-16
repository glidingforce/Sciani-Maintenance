import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import type { Contact, Dataset, Task } from '../types';
import { canSignIn, microsoftConfigured } from '../config';
import { LocalRepo } from '../storage/localRepo';
import { OneDriveRepo } from '../storage/oneDriveRepo';
import { SAFETY_KEYS, SaveError, type Repo, type StorageMode } from '../storage/repo';
import { makeBackup, planRestore, type RestoreMode } from '../lib/backup';
import { backupFileName, downloadJson } from '../lib/download';
import { SignInRequired, getToken, initAuth, signIn, signOut } from '../auth/msal';

const DEMO_FLAG = 'scinai-maintenance:demo-mode';
const LOCAL_FLAG = 'scinai-maintenance:local-only';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export type LoadState = 'loading' | 'ready' | 'needs-sign-in' | 'error';

function preferredMode(): StorageMode {
  try {
    if (localStorage.getItem(DEMO_FLAG) === '1') return 'demo';
    if (localStorage.getItem(LOCAL_FLAG) === '1') return 'local';
  } catch {
    /* storage blocked */
  }
  return cloudAvailable ? 'cloud' : 'local';
}

/** OneDrive storage needs Microsoft sign-in, which needs a web address (not a double-clicked file). */
const cloudAvailable = microsoftConfigured && canSignIn();

function message(e: unknown, fallback: string) {
  if (e instanceof SignInRequired) return 'Microsoft sign-in expired. Open the account menu and sign in again.';
  if (e instanceof SaveError) return e.message;
  return e instanceof Error ? e.message : fallback;
}

export function useWorkspace() {
  const [mode, setMode] = useState<StorageMode>(preferredMode);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(!cloudAvailable);
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<Dataset>({ tasks: [], contacts: [] });
  const [load, setLoad] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const dataRef = useRef(data);
  dataRef.current = data;

  // Microsoft sign-in (completes a returning redirect).
  useEffect(() => {
    if (!cloudAvailable) return;
    initAuth()
      .then((a) => setAccount(a))
      .catch((e) => setAuthError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAuthChecked(true));
  }, []);

  const repo: Repo | null = useMemo(() => {
    if (mode === 'cloud') return account ? new OneDriveRepo({ getToken }) : null;
    return new LocalRepo(mode);
  }, [mode, account?.homeAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (!repo) return;
    try {
      const d = await repo.load();
      setData(d);
      setLoad('ready');
      setLoadError('');
    } catch (e) {
      if (e instanceof SignInRequired) {
        setLoad('needs-sign-in');
        return;
      }
      setLoad('error');
      setLoadError(message(e, 'Could not load.'));
    }
  }, [repo]);

  useEffect(() => {
    if (mode === 'cloud' && !authChecked) return setLoad('loading');
    if (mode === 'cloud' && !account) return setLoad('needs-sign-in');
    setLoad('loading');
    void reload();
  }, [mode, authChecked, account, reload]);

  // Pick up edits made on another device when returning to the app.
  useEffect(() => {
    if (mode !== 'cloud') return;
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode, reload]);

  /** Optimistic write with rollback. "Saved" is shown only after the store confirms. */
  const persist = useCallback(
    async <T extends { id: string }>(key: 'tasks' | 'contacts', item: T, write: (r: Repo) => Promise<void>) => {
      if (!repo) return false;
      const before = dataRef.current;
      setData((d) => {
        const list = d[key] as unknown as T[];
        const i = list.findIndex((x) => x.id === item.id);
        const next = i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
        return { ...d, [key]: next };
      });
      setSave({ kind: 'saving' });
      try {
        await write(repo);
        setSave({ kind: 'saved' });
        return true;
      } catch (e) {
        setData(before);
        setSave({ kind: 'error', message: `Not saved: ${message(e, 'Save failed.')} Your change was undone.` });
        return false;
      }
    },
    [repo],
  );

  const saveTask = useCallback((t: Task) => persist('tasks', t, (r) => r.saveTask(t)), [persist]);
  const saveContact = useCallback((c: Contact) => persist('contacts', c, (r) => r.saveContact(c)), [persist]);

  const deleteContact = useCallback(
    async (id: string) => {
      if (!repo) return false;
      setSave({ kind: 'saving' });
      try {
        await repo.deleteContact(id);
        setData((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== id) }));
        setSave({ kind: 'saved' });
        return true;
      } catch (e) {
        setSave({ kind: 'error', message: message(e, 'Delete failed.') });
        return false;
      }
    },
    [repo],
  );

  /**
   * Restores a validated, converted backup. Order of operations:
   *  1. a copy of the current data is kept in this browser (and, for Replace, downloaded),
   *  2. the new dataset is written in ONE write computed from the latest saved data,
   *  3. only then the screen reloads. If step 2 fails, saved data is unchanged.
   */
  const restore = useCallback(
    async (backup: Dataset, restoreMode: RestoreMode): Promise<{ ok: boolean; message: string }> => {
      if (!repo) return { ok: false, message: 'Storage is not ready.' };
      setSave({ kind: 'saving' });
      try {
        const current = await repo.load();
        const safety = makeBackup(current, mode);
        try {
          localStorage.setItem(SAFETY_KEYS.preRestore, JSON.stringify(safety));
        } catch {
          /* browser storage unavailable; the downloaded copy below still protects Replace */
        }
        if (restoreMode === 'replace') downloadJson(safety, backupFileName(mode, 'before-restore'));
        await repo.apply((latest) => (restoreMode === 'merge' ? planRestore(latest, backup, 'merge').result : backup));
        await reload();
        setSave({ kind: 'saved' });
        return { ok: true, message: 'Restored.' };
      } catch (e) {
        const msg = `${message(e, 'Restore failed.')} Your current data was not changed.`;
        setSave({ kind: 'error', message: msg });
        await reload();
        return { ok: false, message: msg };
      }
    },
    [repo, reload, mode],
  );

  const setDemo = useCallback((on: boolean) => {
    try {
      if (on) localStorage.setItem(DEMO_FLAG, '1');
      else localStorage.removeItem(DEMO_FLAG);
    } catch {
      /* storage blocked: demo flag lasts for this session only */
    }
    setSave({ kind: 'idle' });
    setMode(on ? 'demo' : preferredMode());
  }, []);

  /** Keep using the app on this device without Microsoft sign-in (e.g. while waiting for IT approval). */
  const setLocalOnly = useCallback((on: boolean) => {
    try {
      localStorage.removeItem(DEMO_FLAG);
      if (on) localStorage.setItem(LOCAL_FLAG, '1');
      else localStorage.removeItem(LOCAL_FLAG);
    } catch {
      /* storage blocked */
    }
    setSave({ kind: 'idle' });
    setMode(on || !cloudAvailable ? 'local' : 'cloud');
  }, []);

  const resetDemo = useCallback(async () => {
    if (mode !== 'demo') return;
    new LocalRepo('demo').resetDemo();
    await reload();
  }, [mode, reload]);

  const signOutCloud = useCallback(async () => {
    await signOut();
    setAccount(null);
    setData({ tasks: [], contacts: [] });
  }, []);

  const signInCloud = useCallback(() => {
    setAuthError('');
    signIn().catch((e) => setAuthError(e instanceof Error ? e.message : String(e)));
  }, []);

  return {
    mode,
    account,
    authError,
    signInCloud,
    data,
    load,
    loadError,
    save,
    clearSave: () => setSave({ kind: 'idle' }),
    reload,
    saveTask,
    saveContact,
    deleteContact,
    restore,
    setDemo,
    setLocalOnly,
    cloudAvailable,
    resetDemo,
    signOutCloud,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
