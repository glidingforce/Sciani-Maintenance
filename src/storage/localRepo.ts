import type { Contact, Dataset, Task } from '../types';
import { SAFETY_KEYS, SaveError, type Repo, type StorageMode } from './repo';
import { demoData } from './demo';
import { SCHEMA_VERSION, convertToCurrent } from '../lib/backup';

// The storage key keeps its original name so existing data is found after the upgrade.
export const STORAGE_KEYS = { local: 'scinai-maintenance:records:v1', demo: 'scinai-maintenance:demo:v1' } as const;

/** Browser-only storage. Real ("local") and sample ("demo") data use separate keys. */
export class LocalRepo implements Repo {
  constructor(readonly mode: Exclude<StorageMode, 'cloud'>, private store: Storage = window.localStorage) {}

  private read(): Dataset {
    const raw = this.store.getItem(STORAGE_KEYS[this.mode]);
    if (!raw) {
      const initial = this.mode === 'demo' ? demoData() : { tasks: [], contacts: [] };
      if (this.mode === 'demo') this.write(initial);
      return initial;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new SaveError('The saved data in this browser is damaged and could not be read. Nothing was changed.', e);
    }
    const stored = parsed as { schemaVersion?: number };
    if (stored?.schemaVersion === SCHEMA_VERSION) {
      return { tasks: (parsed as Dataset).tasks, contacts: (parsed as Dataset).contacts };
    }
    // Older data: convert, but keep an untouched copy first.
    const res = convertToCurrent(parsed);
    if (!res.ok) throw new SaveError(`The saved data could not be upgraded: ${res.errors.join(' ')} Nothing was changed.`);
    if (this.mode === 'local' && this.store.getItem(SAFETY_KEYS.preUpgradeLocal) === null) {
      this.store.setItem(SAFETY_KEYS.preUpgradeLocal, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
    }
    this.write(res.data);
    return res.data;
  }

  private write(data: Dataset) {
    try {
      this.store.setItem(STORAGE_KEYS[this.mode], JSON.stringify({ schemaVersion: SCHEMA_VERSION, tasks: data.tasks, contacts: data.contacts }));
    } catch (e) {
      throw new SaveError('This browser refused to save (storage full or blocked).', e);
    }
  }

  async load() {
    return this.read();
  }

  async saveTask(task: Task) {
    const d = this.read();
    const i = d.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) d.tasks[i] = task;
    else d.tasks.push(task);
    this.write(d);
  }

  async saveContact(contact: Contact) {
    const d = this.read();
    const i = d.contacts.findIndex((c) => c.id === contact.id);
    if (i >= 0) d.contacts[i] = contact;
    else d.contacts.push(contact);
    this.write(d);
  }

  async deleteContact(id: string) {
    const d = this.read();
    d.contacts = d.contacts.filter((c) => c.id !== id);
    this.write(d);
  }

  async apply(fn: (current: Dataset) => Dataset) {
    this.write(fn(this.read()));
  }

  /** Resets the demo records to the original sample set. */
  resetDemo() {
    if (this.mode === 'demo') this.write(demoData());
  }
}
