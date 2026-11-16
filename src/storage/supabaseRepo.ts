import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Contact, Dataset, Task } from '../types';
import { config } from '../config';
import { SaveError, type Repo } from './repo';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Only pick up Supabase's own magic-link tokens, never the Microsoft
        // sign-in redirect that returns to the same page.
        detectSessionInUrl: (_url, params) => Boolean(params.access_token && params.refresh_token),
      },
    });
  }
  return client;
}

/**
 * Each record is one row: (id, user_id, data jsonb, updated_at).
 * Row-level security (supabase/schema.sql) limits every row to its owner.
 */
export class SupabaseRepo implements Repo {
  readonly mode = 'cloud' as const;

  async load(): Promise<Dataset> {
    const db = supabase();
    const [tasks, contacts] = await Promise.all([
      db.from('tasks').select('data'),
      db.from('contacts').select('data'),
    ]);
    if (tasks.error) throw new SaveError(`Could not load tasks: ${tasks.error.message}`, tasks.error);
    if (contacts.error) throw new SaveError(`Could not load contacts: ${contacts.error.message}`, contacts.error);
    return {
      tasks: (tasks.data ?? []).map((r) => r.data as Task),
      contacts: (contacts.data ?? []).map((r) => r.data as Contact),
    };
  }

  private async upsert(table: 'tasks' | 'contacts', id: string, data: unknown, updatedAt: string) {
    const { error } = await supabase().from(table).upsert({ id, data, updated_at: updatedAt });
    if (error) throw new SaveError(`Not saved: ${error.message}`, error);
  }

  saveTask(task: Task) {
    return this.upsert('tasks', task.id, task, task.updatedAt);
  }

  saveContact(contact: Contact) {
    return this.upsert('contacts', contact.id, contact, contact.updatedAt);
  }

  async deleteContact(id: string) {
    const { error } = await supabase().from('contacts').delete().eq('id', id);
    if (error) throw new SaveError(`Not deleted: ${error.message}`, error);
  }

  async replaceAll(data: Dataset) {
    // Restore = upsert every record from the backup. Records created after
    // the backup are kept, so a restore never silently destroys work.
    for (const c of data.contacts) await this.saveContact(c);
    for (const t of data.tasks) await this.saveTask(t);
  }
}
