import type { Contact, Dataset, Task } from '../types';
import { SAFETY_KEYS, SaveError, type Repo } from './repo';
import { SCHEMA_VERSION, convertToCurrent } from '../lib/backup';

export const DATA_FILE = 'maintenance-data.json';
const ITEM = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${DATA_FILE}`;

export interface DriveDeps {
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

type Mutation = (d: Dataset) => Dataset;

const upsert = <T extends { id: string }>(list: T[], item: T) => {
  const i = list.findIndex((x) => x.id === item.id);
  return i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
};

function explain(status: number, body: string): string {
  if (status === 401) return 'Microsoft sign-in expired. Sign in again.';
  if (status === 403)
    return 'OneDrive refused access to the app folder (403). Scinai may require admin approval, or the work-account app folder is not available; see README → "If OneDrive refuses".';
  if (status === 507) return 'Your OneDrive is full.';
  if (status === 429 || status === 503) return 'OneDrive is busy. Try again in a moment.';
  return `OneDrive error ${status}${body ? `: ${body}` : ''}`;
}

/**
 * All records live in one JSON file in this app's private OneDrive folder
 * (Apps/Scinai Maintenance/maintenance-data.json), so every signed-in device
 * reads and writes the same data.
 *
 * Every change is applied to the latest copy of the file and written with
 * If-Match on its eTag. If another device saved in between (412), the app
 * re-reads the file and applies the same single-record change again, so
 * edits to different tasks on different devices are never lost.
 */
export class OneDriveRepo implements Repo {
  readonly mode = 'cloud' as const;
  private etag: string | null = null;
  private data: Dataset = { tasks: [], contacts: [] };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private deps: DriveDeps) {}

  private async request(url: string, init: RequestInit = {}, auth = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (auth) headers.set('Authorization', `Bearer ${await this.deps.getToken()}`);
    try {
      return await (this.deps.fetchImpl ?? fetch)(url, { ...init, headers });
    } catch (e) {
      throw new SaveError('Could not reach OneDrive. Check your internet connection.', e);
    }
  }

  private async fail(res: Response): Promise<never> {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message ?? '';
    } catch {
      /* no JSON body */
    }
    throw new SaveError(explain(res.status, msg));
  }

  async load(): Promise<Dataset> {
    const meta = await this.request(ITEM);
    if (meta.status === 404) {
      // First use: no file yet. Nothing is created until the first save.
      this.etag = null;
      this.data = { tasks: [], contacts: [] };
      return this.data;
    }
    if (!meta.ok) return this.fail(meta);
    const item = await meta.json();
    const dl: string | undefined = item['@microsoft.graph.downloadUrl'];
    const content = dl ? await this.request(dl, {}, false) : await this.request(`${ITEM}:/content`);
    if (!content.ok) return this.fail(content);
    const text = await content.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new SaveError('The OneDrive data file is damaged and could not be read. Nothing was changed; OneDrive version history has earlier copies.', e);
    }
    const res = convertToCurrent(parsed);
    if (!res.ok) throw new SaveError(`The OneDrive data could not be read: ${res.errors.join(' ')} Nothing was changed.`);
    const version = (parsed as { version?: number }).version;
    if (version !== SCHEMA_VERSION) {
      // Older file: keep an untouched copy on this device. The file itself is only
      // rewritten (in the new format) on the next save, and OneDrive keeps its history.
      try {
        if (localStorage.getItem(SAFETY_KEYS.preUpgradeCloud) === null)
          localStorage.setItem(SAFETY_KEYS.preUpgradeCloud, JSON.stringify({ savedAt: new Date().toISOString(), raw: text }));
      } catch {
        /* storage unavailable: OneDrive version history still has the old file */
      }
    }
    this.etag = item.eTag ?? null;
    this.data = res.data;
    return this.data;
  }

  private mutate(fn: Mutation): Promise<void> {
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const next = fn(structuredClone(this.data));
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // Only overwrite the exact version we read; create only if nobody else did.
        if (this.etag) headers['If-Match'] = this.etag;
        else headers['If-None-Match'] = '*';
        const res = await this.request(`${ITEM}:/content`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ app: 'scinai-maintenance', version: SCHEMA_VERSION, savedAt: new Date().toISOString(), ...next }),
        });
        if (res.status === 412 || res.status === 409) {
          await this.load(); // someone else saved: refresh and re-apply this change
          continue;
        }
        if (!res.ok) return this.fail(res);
        const item = await res.json();
        this.etag = item.eTag ?? null;
        this.data = next;
        return;
      }
      throw new SaveError('OneDrive kept changing while saving. Refresh and try again.');
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  saveTask(task: Task) {
    return this.mutate((d) => ({ ...d, tasks: upsert(d.tasks, task) }));
  }

  saveContact(contact: Contact) {
    return this.mutate((d) => ({ ...d, contacts: upsert(d.contacts, contact) }));
  }

  deleteContact(id: string) {
    return this.mutate((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== id) }));
  }

  apply(fn: (current: Dataset) => Dataset) {
    return this.mutate(fn);
  }
}
