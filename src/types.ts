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
  /** Original values that could not be converted from an older backup. */
  _legacy?: Record<string, unknown>;
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
  /** The single next step (any task; required for long-term work). */
  nextAction?: string;
  milestoneDate?: DateOnly;
  /** Schema 2: who the task is waiting for (person or company). */
  waitingFor?: string;
  /** Schema 2: what it is waiting for (a quote, a visit, a part). */
  waitingWhat?: string;
  /** Schema 2: what is blocking the work. A recorded blocker means "Blocked"; Waiting alone does not. */
  blocker?: string;
  /** Schema 2: approval, budget, access or another management decision needed. */
  managementAction?: string;
  /** Schema 3: equipment name, e.g. "Huber chiller". */
  equipmentName?: string;
  /** Schema 3: equipment / asset number, e.g. "CH-02". */
  equipmentNumber?: string;
  /** Schema 3: room, e.g. "104" or "חדר נקי 3". */
  room?: string;
  archived: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  followUps: FollowUpEntry[];
  outlook?: OutlookLink;
  /** Original values that could not be converted from an older backup. */
  _legacy?: Record<string, unknown>;
  /** Fields from older or newer versions that this version does not use are kept as they are. */
  [unknownField: string]: unknown;
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
  _legacy?: Record<string, unknown>;
  [unknownField: string]: unknown;
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
