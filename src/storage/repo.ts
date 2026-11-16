import type { Contact, Dataset, Task } from '../types';

/**
 * - cloud: shared Supabase records, same on every signed-in device.
 * - local: this browser only (used while shared storage is not configured).
 * - demo:  sample records kept under a separate key; never mixed with real data.
 */
export type StorageMode = 'cloud' | 'local' | 'demo';

export interface Repo {
  mode: StorageMode;
  load(): Promise<Dataset>;
  saveTask(task: Task): Promise<void>;
  saveContact(contact: Contact): Promise<void>;
  deleteContact(id: string): Promise<void>;
  /** Replaces every record (used by restore-from-backup). */
  replaceAll?(data: Dataset): Promise<void>;
}

export class SaveError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}
