import { describe, expect, it } from 'vitest';
import { OneDriveRepo } from '../src/storage/oneDriveRepo';
import { newTask, newContact, complete } from '../src/lib/tasks';

/** In-memory stand-in for the OneDrive app folder file, with eTag rules. */
function fakeDrive(opts: { forbid?: boolean } = {}) {
  const state = { body: null as string | null, etag: 0, puts: 0 };
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    const json = (status: number, data?: unknown) => new Response(data === undefined ? null : JSON.stringify(data), { status });
    if (opts.forbid) return json(403, { error: { message: 'Access denied' } });
    if (url.startsWith('https://download/')) return new Response(state.body, { status: 200 });
    const method = init.method ?? 'GET';
    if (method === 'GET' && !url.endsWith(':/content')) {
      if (state.body === null) return json(404, { error: { message: 'itemNotFound' } });
      return json(200, { eTag: `"e${state.etag}"`, '@microsoft.graph.downloadUrl': 'https://download/file' });
    }
    if (method === 'PUT') {
      state.puts++;
      const ifMatch = h.get('If-Match');
      const ifNone = h.get('If-None-Match');
      if (ifNone === '*' && state.body !== null) return json(412, {});
      if (ifMatch && ifMatch !== `"e${state.etag}"`) return json(412, {});
      if (!h.get('Authorization')) return json(401, {});
      state.body = init.body as string;
      state.etag++;
      return json(200, { eTag: `"e${state.etag}"` });
    }
    return json(400, {});
  }) as unknown as typeof fetch;
  return { state, deps: { getToken: async () => 'tok', fetchImpl } };
}

describe('OneDrive storage', () => {
  it('starts empty, creates the file on first save, and reloads it', async () => {
    const d = fakeDrive();
    const repo = new OneDriveRepo(d.deps);
    expect(await repo.load()).toEqual({ tasks: [], contacts: [] });
    expect(d.state.body).toBeNull(); // nothing written just by opening
    const t = newTask({ title: 'Check AHU-02' });
    await repo.saveTask(t);
    await repo.saveTask(complete(t));
    const other = new OneDriveRepo(d.deps); // "another device"
    const loaded = await other.load();
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0].status).toBe('done');
  });

  it('two devices editing different records keep both changes', async () => {
    const d = fakeDrive();
    const phone = new OneDriveRepo(d.deps);
    const pc = new OneDriveRepo(d.deps);
    await phone.load();
    await pc.load();
    await phone.saveTask(newTask({ title: 'from phone' }));
    await pc.saveTask(newTask({ title: 'from pc' })); // stale eTag -> 412 -> reload -> reapply
    await pc.saveContact(newContact({ name: 'Yossi' }));
    const fresh = await new OneDriveRepo(d.deps).load();
    expect(fresh.tasks.map((t) => t.title).sort()).toEqual(['from pc', 'from phone']);
    expect(fresh.contacts).toHaveLength(1);
  });

  it('a refused folder reports a clear error instead of pretending', async () => {
    const repo = new OneDriveRepo(fakeDrive({ forbid: true }).deps);
    await expect(repo.load()).rejects.toThrow(/refused access/);
    await expect(repo.saveTask(newTask({ title: 'x' }))).rejects.toThrow(/refused access/);
  });

  it('offline is reported as a connection problem', async () => {
    const repo = new OneDriveRepo({ getToken: async () => 't', fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch });
    await expect(repo.saveTask(newTask({ title: 'x' }))).rejects.toThrow(/internet connection/);
  });
});
