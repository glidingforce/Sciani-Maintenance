import type { Contact, Dataset, Task } from '../types';
import { SaveError, type Repo, type StorageMode } from './repo';
import { demoData } from './demo';

const KEYS = { local: 'scinai-maintenance:records:v1', demo: 'scinai-maintenance:demo:v1' } as const;

/** Browser-only storage. Real ("local") and sample ("demo") data use separate keys. */
export class LocalRepo implements Repo {
  constructor(readonly mode: Exclude<StorageMode, 'cloud'>, private store: Storage = window.localStorage) {}

  private read(): Dataset {
    const raw = this.store.getItem(KEYS[this.mode]);
    if (!raw) {
      const initial = this.mode === 'demo' ? demoData() : { tasks: [], contacts: [] };
      if (this.mode === 'demo') this.write(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as Dataset;
    return { tasks: parsed.tasks ?? [], contacts: parsed.contacts ?? [] };
  }

  private write(data: Dataset) {
    try {
      this.store.setItem(KEYS[this.mode], JSON.stringify(data));
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

  async replaceAll(data: Dataset) {
    // Same rule as cloud restore: backup records overwrite by id, newer records stay.
    const d = this.read();
    const merge = <T extends { id: string }>(cur: T[], inc: T[]) => {
      const m = new Map(cur.map((x) => [x.id, x]));
      for (const x of inc) m.set(x.id, x);
      return [...m.values()];
    };
    this.write({ tasks: merge(d.tasks, data.tasks), contacts: merge(d.contacts, data.contacts) });
  }

  /** Resets the demo records to the original sample set. */
  resetDemo() {
    if (this.mode === 'demo') this.write(demoData());
  }
}
