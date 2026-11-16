export type Priority = 'High' | 'Normal' | 'Low';
export type Status = 'todo' | 'in_progress' | 'waiting' | 'done';
export type Kind = 'task' | 'project';
export type Owner = 'me' | 'other';
export type ContactType = 'Contractor' | 'Vendor' | 'Internal' | 'Other';

/** A date-only value, YYYY-MM-DD, interpreted in the app time zone. */
export type DateOnly = string;

export interface FollowUpEntry {
  id: string;
  date: DateOnly;
  note: string;
  loggedAt: string; // ISO timestamp
}

/** Link between a task and one Outlook event. Times are wall-clock in `timeZone`. */
export interface OutlookLink {
  eventId?: string;
  /** Set before the create request so a retry cannot create a second event. */
  transactionId: string;
  webLink?: string;
  start?: string; // e.g. 2026-11-18T09:00:00
  end?: string;
  timeZone: string; // Windows zone name used with Graph, e.g. "Israel Standard Time"
  subject?: string;
  state: 'pending' | 'scheduled' | 'removed';
  lastChecked?: string;
}

export interface Task {
  id: string;
  kind: Kind;
  title: string;
  priority: Priority;
  status: Status;
  dueDate?: DateOnly;
  owner: Owner;
  /** Who is doing it when owner is "other" (a person, or a contact's name). */
  assignee?: string;
  area?: string;
  requester?: string;
  contactId?: string;
  notes?: string;
  nextFollowUp?: DateOnly;
  /** Long-term projects: the single next step. */
  nextAction?: string;
  milestoneDate?: DateOnly;
  archived: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  followUps: FollowUpEntry[];
  outlook?: OutlookLink;
}

export interface Contact {
  id: string;
  name: string;
  company?: string;
  type: ContactType;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  tasks: Task[];
  contacts: Contact[];
}

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
};

export const PRIORITIES: Priority[] = ['High', 'Normal', 'Low'];
export const STATUSES: Status[] = ['todo', 'in_progress', 'waiting', 'done'];
export const CONTACT_TYPES: ContactType[] = ['Contractor', 'Vendor', 'Internal', 'Other'];
