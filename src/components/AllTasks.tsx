import { useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import type { Contact, RecordCategory, Task } from '../types';
import { CATEGORY_LABEL, RECORD_CATEGORIES } from '../types';
import { followUpDue, isOpen, type QuickAction } from '../lib/tasks';
import { categoryOf, inWorkspace } from '../lib/categories';
import { TaskRow } from './TaskRow';
import { NO_FILTER, applyView, type ViewFilter } from '../lib/filters';
import { sortPurchasing, sortTasks, type TaskSort as Sort } from '../lib/taskView';
import { FilterBar } from './Today';
import { TaskSort } from './TaskSort';

type View = 'open' | 'waiting' | 'followup' | 'longterm' | 'done' | 'archived';

const VIEWS: [View, string][] = [
  ['open', 'Open'],
  ['waiting', 'Waiting'],
  ['followup', 'Follow-up due'],
  ['longterm', 'Long-term'],
  ['done', 'Closed'],
  ['archived', 'Archived'],
];

export function AllTasks(props: {
  purchasing?: boolean;
  tasks: Task[];
  contacts: Contact[];
  today: string;
  onAdd: () => void;
  onReport: () => void;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  onQuick: (t: Task, a: QuickAction) => void;
  onLog?: (t: Task) => void;
}) {
  const [view, setView] = useState<View>('open');
  const [f, setF] = useState<ViewFilter>(NO_FILTER);
  const [sort, setSort] = useState<Sort>('urgent');
  const [category, setCategory] = useState<'' | RecordCategory>('');
  const workspace = props.tasks.filter((t) => inWorkspace(t, !!props.purchasing));

  const rows = useMemo(() => {
    const byView = props.tasks.filter((t) => {
      if (!inWorkspace(t, !!props.purchasing)) return false;
      if (category && categoryOf(t) !== category) return false;
      if (view === 'archived') return t.archived;
      if (t.archived) return false;
      if (view === 'done') return t.status === 'done';
      if (view === 'waiting') return isOpen(t) && t.status === 'waiting';
      if (view === 'followup') return followUpDue(t, props.today);
      if (view === 'longterm') return isOpen(t) && t.kind === 'project';
      return isOpen(t);
    });
    const list = applyView(byView, props.contacts, f);
    if ((view === 'done' || view === 'archived') && sort === 'urgent') return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return props.purchasing ? sortPurchasing(list, sort, props.today) : sortTasks(list, sort, props.today);
  }, [props.tasks, props.contacts, props.today, props.purchasing, category, view, f, sort]);

  return (
    <>
      <div className="intro" style={{ marginBottom: 8 }}>
        <div><p className="eyebrow">{props.purchasing ? 'Orders, quotations & follow-ups' : 'Your maintenance workspace'}</p><h1 className="page-title">{props.purchasing ? 'Purchasing' : 'Malfunctions'}</h1><p className="subtle">{props.purchasing ? 'Track purchase orders, הצעות מחיר, and supplier follow-ups.' : 'Track malfunctions across every area and owner.'}</p></div>
        <div className="day-actions">
          <button type="button" className="btn" onClick={props.onReport}>
            <FileText className="icon" /> <span className="hide-sm">Export </span>report
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onAdd}>
            <Plus className="icon" /> {props.purchasing ? 'Add purchasing record' : 'Add malfunction'}
          </button>
        </div>
      </div>
      <FilterBar f={f} set={setF} tasks={workspace} contacts={props.contacts} />
      {props.purchasing && <label className="category-filter field"><span>Purchasing category</span><select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
        <option value="">All purchasing</option>{RECORD_CATEGORIES.filter((c) => c !== 'malfunction').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select></label>}
      <div className="section-head">
        <div className="filters" role="group" aria-label="Status">
          {VIEWS.filter(([v]) => !props.purchasing || v !== 'longterm').map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {l}
            </button>
          ))}
        </div>
        <TaskSort value={sort} onChange={setSort} purchasing={props.purchasing} />
      </div>
      <p className="result-count">{rows.length} {props.purchasing ? 'record' : 'malfunction'}{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 && <p className="empty">No records match this view. Try another status or clear your filters.</p>}
      {rows.map((t) => (
        <TaskRow key={t.id} task={t} contacts={props.contacts} today={props.today} onOpen={props.onOpen} onToggle={props.onToggle} onQuick={props.onQuick} onLog={props.onLog} />
      ))}
    </>
  );
}
