import type { TaskSort as Sort } from '../lib/taskView';

export function TaskSort({ value, onChange }: { value: Sort; onChange: (v: Sort) => void }) {
  return <label className="sort-control"><span>Sort by</span>
    <select className="input" aria-label="Sort tasks" value={value} onChange={(e) => onChange(e.target.value as Sort)}>
      <option value="urgent">Urgency</option><option value="due">Due date</option>
      <option value="priority">Priority</option><option value="oldest">Oldest first</option>
    </select>
  </label>;
}
