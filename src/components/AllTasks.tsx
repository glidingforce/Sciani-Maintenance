import { useMemo, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import type { Contact, Task } from '../types';
import { compareDaily, isOpen, matchesOwner, searchTasks, type OwnerFilter, type QuickAction } from '../lib/tasks';
import { TaskRow } from './TaskRow';
import { getMyName } from '../lib/settings';

type View = 'open' | 'waiting' | 'longterm' | 'done' | 'archived';

const VIEWS: [View, string][] = [
  ['open', 'Open'],
  ['waiting', 'Waiting'],
  ['longterm', 'Long-term'],
  ['done', 'Done'],
  ['archived', 'Archived'],
];

export function AllTasks(props: {
  tasks: Task[];
  contacts: Contact[];
  today: string;
  onAdd: () => void;
  onReport: () => void;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  onQuick: (t: Task, a: QuickAction) => void;
}) {
  const [view, setView] = useState<View>('open');
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const byView = props.tasks.filter((t) => {
      if (view === 'archived') return t.archived;
      if (t.archived) return false;
      if (view === 'done') return t.status === 'done';
      if (view === 'waiting') return isOpen(t) && t.status === 'waiting';
      if (view === 'longterm') return isOpen(t) && t.kind === 'project';
      return isOpen(t);
    });
    const list = searchTasks(byView, query, props.contacts).filter((t) => matchesOwner(t, owner));
    if (view === 'done' || view === 'archived') return list.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    return list.sort(compareDaily(props.today));
  }, [props.tasks, props.contacts, props.today, view, owner, query]);

  return (
    <>
      <div className="intro" style={{ marginBottom: 8 }}>
        <h1 className="page-title">All Tasks</h1>
        <div className="day-actions">
          <button type="button" className="btn" onClick={props.onReport}>
            <FileText className="icon" /> <span className="hide-sm">Export </span>report
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onAdd}>
            <Plus className="icon" /> Task
          </button>
        </div>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search className="icon" />
          <span className="sr-only">Search tasks</span>
          <input className="input" type="search" placeholder="Search task, equipment, room, person, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className="section-head">
        <div className="filters" role="group" aria-label="Status">
          {VIEWS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="filters" role="group" aria-label="Who is doing it">
          {(
            [
              ['all', 'All'],
              ['mine', getMyName()],
              ['others', 'Others'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={owner === v} onClick={() => setOwner(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 && <p className="empty">{query ? 'No matching tasks.' : 'Nothing here.'}</p>}
      {rows.map((t) => (
        <TaskRow key={t.id} task={t} contacts={props.contacts} today={props.today} onOpen={props.onOpen} onToggle={props.onToggle} onQuick={props.onQuick} />
      ))}
    </>
  );
}
