import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Contact, Dataset, Task } from '../types';
import { supabaseConfigured } from '../config';
import { LocalRepo } from '../storage/localRepo';
import { SupabaseRepo, supabase } from '../storage/supabaseRepo';
import type { Repo, StorageMode } from '../storage/repo';

const DEMO_FLAG = 'scinai-maintenance:demo-mode';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export type LoadState = 'loading' | 'ready' | 'needs-sign-in' | 'error';

function preferredMode(): StorageMode {
  try {
    if (localStorage.getItem(DEMO_FLAG) === '1') return 'demo';
  } catch {
    /* storage blocked */
  }
  return supabaseConfigured ? 'cloud' : 'local';
}

export function useWorkspace() {
  const [mode, setMode] = useState<StorageMode>(preferredMode);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!supabaseConfigured);
  const [data, setData] = useState<Dataset>({ tasks: [], contacts: [] });
  const [load, setLoad] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const dataRef = useRef(data);
  dataRef.current = data;

  // Supabase session tracking (cloud mode only).
  useEffect(() => {
    if (!supabaseConfigured) return;
    const db = supabase();
    db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const repo: Repo | null = useMemo(() => {
    if (mode === 'cloud') return session ? new SupabaseRepo() : null;
    return new LocalRepo(mode);
  }, [mode, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (!repo) return;
    try {
      const d = await repo.load();
      setData(d);
      setLoad('ready');
      setLoadError('');
    } catch (e) {
      setLoad('error');
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [repo]);

  useEffect(() => {
    if (mode === 'cloud' && !authChecked) return setLoad('loading');
    if (mode === 'cloud' && !session) return setLoad('needs-sign-in');
    setLoad('loading');
    void reload();
  }, [mode, authChecked, session, reload]);

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
        setSave({ kind: 'error', message: `${e instanceof Error ? e.message : 'Save failed.'} Your change was undone.` });
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
        setSave({ kind: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
        return false;
      }
    },
    [repo],
  );

  const restore = useCallback(
    async (backup: Dataset) => {
      if (!repo?.replaceAll) return false;
      setSave({ kind: 'saving' });
      try {
        await repo.replaceAll(backup);
        await reload();
        setSave({ kind: 'saved' });
        return true;
      } catch (e) {
        setSave({ kind: 'error', message: e instanceof Error ? e.message : 'Restore failed.' });
        await reload();
        return false;
      }
    },
    [repo, reload],
  );

  const setDemo = useCallback((on: boolean) => {
    try {
      if (on) localStorage.setItem(DEMO_FLAG, '1');
      else localStorage.removeItem(DEMO_FLAG);
    } catch {
      /* storage blocked: demo flag lasts for this session only */
    }
    setSave({ kind: 'idle' });
    setMode(on ? 'demo' : supabaseConfigured ? 'cloud' : 'local');
  }, []);

  const resetDemo = useCallback(async () => {
    if (mode !== 'demo') return;
    new LocalRepo('demo').resetDemo();
    await reload();
  }, [mode, reload]);

  const signOutCloud = useCallback(async () => {
    if (supabaseConfigured) await supabase().auth.signOut();
    setData({ tasks: [], contacts: [] });
  }, []);

  return {
    mode,
    session,
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
    resetDemo,
    signOutCloud,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
