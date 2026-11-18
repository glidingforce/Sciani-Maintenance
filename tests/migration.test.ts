import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertToCurrent, makeBackup, planRestore, SCHEMA_VERSION } from '../src/lib/backup';
import { LocalRepo, STORAGE_KEYS } from '../src/storage/localRepo';
import { SAFETY_KEYS } from '../src/storage/repo';

// Real files produced by the previous (v1) app: an "Export backup" download and its raw browser storage.
const v1ExportText = readFileSync(new URL('./fixtures/v1-export.json', import.meta.url), 'utf8');
const v1StorageText = readFileSync(new URL('./fixtures/v1-localstorage.json', import.meta.url), 'utf8');
const edge = JSON.parse(readFileSync(new URL('./fixtures/legacy-edge.json', import.meta.url), 'utf8'));
const v1Export = JSON.parse(v1ExportText);
const v1Storage = JSON.parse(v1StorageText);

class MemoryStorage {
  m = new Map<string, string>();
  failWrites = false;
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.failWrites) throw new Error('QuotaExceeded'); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mem = () => new MemoryStorage();

describe('real v1 backups', () => {
  it('the v1 export is accepted and every record is preserved exactly', () => {
    expect(v1Export.version).toBe(1);
    const r = convertToCurrent(v1Export);
    expect(r.ok).toBe(true);
    expect(r.sourceVersion).toBe(1);
    expect(r.warnings).toEqual([]);
    expect(r.data.tasks).toHaveLength(8);
    expect(r.data.contacts).toHaveLength(1);
    // Field-for-field identical: IDs, titles, notes, dates, status, priority, links, follow-ups.
    expect(r.data.tasks).toEqual(v1Export.tasks);
    expect(r.data.contacts).toEqual(v1Export.contacts);
  });

  it('raw v1 browser storage (no version field) is accepted the same way', () => {
    expect(v1Storage.version).toBeUndefined();
    const r = convertToCurrent(v1Storage);
    expect(r.ok).toBe(true);
    expect(r.sourceVersion).toBe('none');
    expect(r.data.tasks).toEqual(v1Storage.tasks);
  });

  it('keeps the details that matter', () => {
    const r = convertToCurrent(v1Export).data;
    const byTitle = (s: string) => r.tasks.find((t) => t.title.includes(s))!;
    const hebrew = byTitle('HEPA');
    expect(hebrew.title).toBe('החלפת מסנן HEPA בחדר נקי 3');
    expect(hebrew.notes).toBe('לתאם עם הייצור · coordinate with production');
    expect(hebrew.dueDate).toBe('2026-11-12');
    expect(hebrew.priority).toBe('High');
    const chiller = byTitle('Huber');
    expect(chiller.status).toBe('waiting');
    expect(chiller.contactId).toBe(r.contacts[0].id);
    expect(chiller.followUps[0].note).toBe('דיברתי עם יוסי – visit Thursday');
    expect(chiller.nextFollowUp).toBe('2026-11-18');
    expect(byTitle('door closer').status).toBe('done');
    expect(byTitle('door closer').completedAt).toBeTruthy();
    expect(byTitle('Old archived').archived).toBe(true);
    expect(byTitle('shutdown').kind).toBe('project');
    expect(byTitle('shutdown').nextAction).toBe('Collect contractor availability');
    expect(r.contacts[0].name).toBe('יוסי לוי');
    // New schema-2 fields are left empty, never invented.
    for (const t of r.tasks) {
      expect(t.waitingFor).toBeUndefined();
      expect(t.blocker).toBeUndefined();
      expect(t.managementAction).toBeUndefined();
    }
  });
});

describe('in-place upgrade of browser data', () => {
  it('upgrades v1 storage, keeps an untouched copy, and loses nothing', async () => {
    const store = mem();
    store.setItem(STORAGE_KEYS.local, v1StorageText);
    const loaded = await new LocalRepo('local', store as unknown as Storage).load();
    expect(loaded.tasks).toEqual(v1Storage.tasks);
    expect(loaded.contacts).toEqual(v1Storage.contacts);
    const saved = JSON.parse(store.getItem(STORAGE_KEYS.local)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(store.getItem(SAFETY_KEYS.preUpgradeLocal)!).raw).toBe(v1StorageText);
  });

  it('running the upgrade again changes nothing and duplicates nothing', async () => {
    const store = mem();
    store.setItem(STORAGE_KEYS.local, v1StorageText);
    await new LocalRepo('local', store as unknown as Storage).load();
    const afterFirst = store.getItem(STORAGE_KEYS.local);
    const snapshot = store.getItem(SAFETY_KEYS.preUpgradeLocal);
    for (let i = 0; i < 3; i++) await new LocalRepo('local', store as unknown as Storage).load();
    expect(store.getItem(STORAGE_KEYS.local)).toBe(afterFirst);
    expect(store.getItem(SAFETY_KEYS.preUpgradeLocal)).toBe(snapshot);
    expect(JSON.parse(afterFirst!).tasks).toHaveLength(8);
  });

  it('damaged saved data is reported and left untouched', async () => {
    const store = mem();
    store.setItem(STORAGE_KEYS.local, '{"tasks": [ broken');
    await expect(new LocalRepo('local', store as unknown as Storage).load()).rejects.toThrow(/damaged/);
    expect(store.getItem(STORAGE_KEYS.local)).toBe('{"tasks": [ broken');
  });
});

describe('restoring old backups into the new version', () => {
  it('merge into existing data matches by ID and never duplicates, even when repeated', async () => {
    const store = mem();
    const repo = new LocalRepo('local', store as unknown as Storage);
    await repo.saveTask({ ...convertToCurrent(v1Export).data.tasks[0], title: 'edited after backup' });
    const backup = convertToCurrent(v1Export).data;
    for (let i = 0; i < 2; i++) await repo.apply((cur) => planRestore(cur, backup, 'merge').result);
    const d = await repo.load();
    expect(d.tasks).toHaveLength(8);
    expect(new Set(d.tasks.map((t) => t.id)).size).toBe(8);
    expect(d.tasks[0].title).toBe(v1Export.tasks[0].title); // backup version wins for same ID
  });

  it('the merge preview counts match what is written', () => {
    const backup = convertToCurrent(v1Export).data;
    const current = { tasks: [backup.tasks[0], { ...backup.tasks[1], title: 'changed' }], contacts: [] };
    const plan = planRestore(current, backup, 'merge');
    expect([plan.added, plan.updated, plan.unchanged]).toEqual([6 + 1, 1, 1]); // 6 tasks + 1 contact new
    expect(plan.result.tasks).toHaveLength(8);
  });

  it('replace swaps the dataset and reports what disappears', () => {
    const backup = convertToCurrent(v1Export).data;
    const extra = { ...backup.tasks[0], id: 'only-here' };
    const plan = planRestore({ tasks: [extra], contacts: [] }, backup, 'replace');
    expect(plan.removed).toBe(1);
    expect(plan.result).toEqual(backup);
  });

  it('a failed write leaves current data exactly as it was', async () => {
    const store = mem();
    const repo = new LocalRepo('local', store as unknown as Storage);
    await repo.saveTask(convertToCurrent(v1Export).data.tasks[0]);
    const before = store.getItem(STORAGE_KEYS.local);
    store.failWrites = true;
    await expect(repo.apply(() => convertToCurrent(v1Export).data)).rejects.toThrow();
    expect(store.getItem(STORAGE_KEYS.local)).toBe(before);
  });

  it('a new-format backup round-trips Hebrew and every field', () => {
    const data = convertToCurrent(v1Export).data;
    data.tasks[0] = { ...data.tasks[0], waitingFor: 'קבלן מיזוג', blocker: 'Waiting for PO', managementAction: 'אישור תקציב' };
    const file = JSON.parse(JSON.stringify(makeBackup(data, 'local')));
    expect(file.version).toBe(SCHEMA_VERSION);
    const r = convertToCurrent(file);
    expect(r.warnings).toEqual([]);
    expect(r.unchanged).toBe(true);
    expect(r.data).toEqual(data);
  });
});

describe('older or irregular records', () => {
  const r = convertToCurrent(edge);
  const t = (id: string) => r.data.tasks.find((x) => x.id === id)!;

  it('is accepted, with a note for every conversion', () => {
    expect(r.ok).toBe(true);
    expect(r.sourceVersion).toBe('none');
    expect(r.warnings.length).toBeGreaterThanOrEqual(7);
  });
  it('maps renamed values explicitly', () => {
    expect(t('t-1').priority).toBe('High'); // "high"
    expect(t('t-1').status).toBe('in_progress'); // "In progress"
    expect(t('t-2').status).toBe('done'); // "completed"
  });
  it('never shifts a date through a time zone', () => {
    expect(t('t-1').dueDate).toBe('2026-11-20'); // from "2026-11-20T00:00:00+02:00"
  });
  it('keeps unconvertible values and unknown fields instead of dropping them', () => {
    expect(t('t-2').dueDate).toBeUndefined();
    expect(t('t-2')._legacy).toEqual({ priority: 'urgent', dueDate: 'next week' });
    expect(t('t-2').priority).toBe('Normal');
    expect(t('t-2').title).toBe('בדיקת לחץ בקיטור נקי');
    expect(t('t-2').notes).toBe('טקסט בעברית 123 · mixed');
    expect(t('t-1').customField).toEqual({ keep: true });
    expect(t('t-6')._legacy).toMatchObject({ status: 'blocked' });
    expect(t('t-6').title).toBe('(untitled)');
  });
  it('keeps the record without an ID (new ID) and one copy of a duplicated ID', () => {
    expect(r.data.tasks.find((x) => x.title === 'No id here')?.id).toBeTruthy();
    expect(r.data.tasks.filter((x) => x.id === 't-4')).toHaveLength(1);
    expect(t('t-4').title).toBe('Duplicate newer');
    expect(t('t-4').contactId).toBe('missing-contact');
    expect(r.data.tasks).toHaveLength(5); // 6 entries, one duplicated ID
  });
  it('converts contacts', () => {
    expect(r.data.contacts.find((c) => c.id === 'c-1')!.type).toBe('Vendor');
    expect(r.data.contacts.find((c) => c.id === 'c-2')!.name).toBe('Only company Ltd');
  });
  it('does not modify the input object', () => {
    expect(edge.tasks[0].priority).toBe('high');
  });
});

describe('rejected files leave everything unchanged', () => {
  it.each([
    ['not an object', 'hello'],
    ['another app', { app: 'other-app', tasks: [], contacts: [] }],
    ['no lists', { app: 'scinai-maintenance', version: 1 }],
    ['from a newer app', { app: 'scinai-maintenance', version: 99, tasks: [], contacts: [] }],
    ['an unreadable entry', { tasks: [{ id: 'a', title: 'ok' }, 'garbage'], contacts: [] }],
  ])('%s', (_name, input) => {
    const r = convertToCurrent(input);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
