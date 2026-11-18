import type { RecordCategory, Task } from '../types';
import { CATEGORY_LABEL } from '../types';

export const categoryOf = (t: Task): RecordCategory => t.category ?? 'malfunction';
export const isPurchasing = (t: Task) => categoryOf(t) !== 'malfunction';
export const categoryLabel = (t: Task) => CATEGORY_LABEL[categoryOf(t)];
export const inWorkspace = (t: Task, purchasing: boolean) => isPurchasing(t) === purchasing;
export type CategoryFilter = '' | 'purchasing' | RecordCategory;
export const matchesCategory = (t: Task, category?: CategoryFilter) => !category || (category === 'purchasing' ? isPurchasing(t) : categoryOf(t) === category);
export const outcomeLabel = (t: Task) => t.solved === undefined ? 'Not recorded'
  : isPurchasing(t) ? (t.solved ? 'Completed' : 'Not completed') : (t.solved ? 'Solved' : 'Not solved');
