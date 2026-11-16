import { useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import type { Contact, Task } from '../types';
import { isOpen, type QuickAction } from '../lib/tasks';
import { TaskRow } from './TaskRow';
import { NO_FILTER, applyView, type ViewFilter } from '../lib/filters';
import { sortTasks, type TaskSort as Sort } from '../lib/taskView';
import { FilterBar } from './Today';
import { TaskSort } from './TaskSort';

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
  const [f, setF] = useState<ViewFilter>(NO_FILTER);
  const [sort, setSort] = useState<Sort>('urgent');

  const rows = useMemo(() => {
    const byView = props.tasks.filter((t) => {
      if (view === 'archived') return t.archived;
      if (t.archived) return false;
      if (view === 'done') return t.status === 'done';
      if (view === 'waiting') return isOpen(t) && t.status === 'waiting';
      if (view === 'longterm') return isOpen(t) && t.kind === 'project';
      return isOpen(t);
    });
    const list = applyView(byView, props.contacts, f);
    if ((view === 'done' || view === 'archived') && sort === 'urgent') return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sortTasks(list, sort, props.today);
  }, [props.tasks, props.contacts, props.today, view, f, sort]);

  return (
    <>
      <div className="intro" style={{ marginBottom: 8 }}>
        <div><p className="eyebrow">Your maintenance workspace</p><h1 className="page-title">All Tasks</h1><p className="subtle">Track work across every area and owner.</p></div>
        <div className="day-actions">
          <button type="button" className="btn" onClick={props.onReport}>
            <FileText className="icon" /> <span className="hide-sm">Export </span>report
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onAdd}>
            <Plus className="icon" /> Add task
          </button>
        </div>
      </div>
      <FilterBar f={f} set={setF} tasks={props.tasks} contacts={props.contacts} />
      <div className="section-head">
        <div className="filters" role="group" aria-label="Status">
          {VIEWS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {l}
            </button>
          ))}
        </div>
        <TaskSort value={sort} onChange={setSort} />
      </div>
      <p className="result-count">{rows.length} task{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 && <p className="empty">No tasks match this view. Try another status or clear your filters.</p>}
      {rows.map((t) => (
        <TaskRow key={t.id} task={t} contacts={props.contacts} today={props.today} onOpen={props.onOpen} onToggle={props.onToggle} onQuick={props.onQuick} />
      ))}
    </>
  );
}
