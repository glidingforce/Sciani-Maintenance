import { describe, expect, it } from 'vitest';
import { LocalRepo } from '../src/storage/localRepo';
import { complete, newTask } from '../src/lib/tasks';

class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

describe('local storage', () => {
  it('persists across a reload (new repo instance)', async () => {
    const store = new MemoryStorage() as unknown as Storage;
    const t = newTask({ title: 'Replace door closer' });
    await new LocalRepo('local', store).saveTask(t);
    await new LocalRepo('local', store).saveTask(complete(t));
    const loaded = await new LocalRepo('local', store).load();
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0].status).toBe('done');
  });

  it('keeps demo and real records apart', async () => {
    const store = new MemoryStorage() as unknown as Storage;
    await new LocalRepo('local', store).saveTask(newTask({ title: 'real' }));
    const demo = await new LocalRepo('demo', store).load();
    expect(demo.tasks.some((t) => t.title === 'real')).toBe(false);
    expect(demo.tasks.length).toBeGreaterThan(0);
    const real = await new LocalRepo('local', store).load();
    expect(real.tasks.map((t) => t.title)).toEqual(['real']);
  });

  it('reports a failed save instead of pretending', async () => {
    const store = new MemoryStorage() as unknown as Storage;
    store.setItem = () => { throw new Error('QuotaExceeded'); };
    await expect(new LocalRepo('local', store).saveTask(newTask({ title: 'x' }))).rejects.toThrow(/refused to save/);
  });

  it('restore merges by id and keeps newer records', async () => {
    const store = new MemoryStorage() as unknown as Storage;
    const repo = new LocalRepo('local', store);
    const keep = newTask({ title: 'created after backup' });
    const old = newTask({ title: 'old title' });
    await repo.saveTask(keep);
    await repo.saveTask({ ...old, title: 'edited' });
    await repo.replaceAll({ tasks: [old], contacts: [] });
    const titles = (await repo.load()).tasks.map((t) => t.title).sort();
    expect(titles).toEqual(['created after backup', 'old title']);
  });
});
