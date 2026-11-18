import type { Contact, Dataset, Task } from '../types';

/**
 * - cloud: your OneDrive data file, the same on every signed-in device.
 * - local: this browser only.
 * - demo:  sample records kept under a separate key; never mixed with real data.
 */
export type StorageMode = 'cloud' | 'local' | 'demo';

export interface Repo {
  mode: StorageMode;
  load(): Promise<Dataset>;
  saveTask(task: Task): Promise<void>;
  saveContact(contact: Contact): Promise<void>;
  deleteContact(id: string): Promise<void>;
  /** Replaces the whole dataset in one write, computed from the latest saved data.
   * Used by restore: if the write fails, the saved data is unchanged. */
  apply(fn: (current: Dataset) => Dataset): Promise<void>;
}

export class SaveError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

/** Browser keys that hold automatic safety copies. Never overwritten once written. */
export const SAFETY_KEYS = {
  // One copy per source version: e.g. ...:local (from v1, written by v2) and ...:local:v2 (from v2).
  preUpgradeLocal: 'scinai-maintenance:pre-upgrade-backup:local',
  preUpgradeCloud: 'scinai-maintenance:pre-upgrade-backup:onedrive',
  preRestore: 'scinai-maintenance:pre-restore-backup', // the latest one is kept
} as const;

/** Key for the untouched copy taken before upgrading data written in `fromVersion`. */
export function preUpgradeKey(base: string, fromVersion: number | 'none'): string {
  // Keys from the v2 release (upgrading v1 data) had no suffix; keep that name so they stay findable.
  return fromVersion === 'none' || fromVersion === 1 ? base : `${base}:v${fromVersion}`;
}
