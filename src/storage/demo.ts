import type { Dataset } from '../types';
import { addDays, todayISO } from '../lib/dates';
import { newContact, newTask } from '../lib/tasks';

/** Sample records for demo mode only. Dates are relative to today. */
export function demoData(): Dataset {
  const today = todayISO();
  const cooling = newContact({ name: 'Yossi Levi', company: 'Cooling contractor', type: 'Contractor', phone: '+972500000000' });
  const compressor = newContact({ name: 'Service desk', company: 'Compressor vendor', type: 'Vendor', email: 'service@example.com' });
  return {
    contacts: [cooling, compressor],
    tasks: [
      newTask({ title: 'Investigate AHU-02 pressure alarm', area: 'Production · HVAC', priority: 'High', dueDate: today, status: 'in_progress' }),
      newTask({
        title: 'Confirm chiller service visit',
        area: 'Utilities',
        priority: 'High',
        dueDate: today,
        owner: 'other',
        contactId: cooling.id,
        status: 'waiting',
        nextFollowUp: today,
      }),
      newTask({ title: 'Replace warehouse door closer', area: 'Warehouse', requester: 'QA', dueDate: today }),
      newTask({ title: 'Update PM checklist for WFI loop', area: 'Utilities · WFI', priority: 'Normal', dueDate: addDays(today, -2) }),
      newTask({
        title: 'Review compressor quotation',
        area: 'Utilities',
        dueDate: addDays(today, 2),
        owner: 'other',
        contactId: compressor.id,
        status: 'waiting',
        nextFollowUp: addDays(today, 2),
      }),
      newTask({ title: 'Order spare belts for AHU-05', area: 'HVAC', priority: 'Low' }),
      newTask({
        kind: 'project',
        title: 'Annual shutdown planning',
        nextAction: 'Collect contractor availability',
        milestoneDate: addDays(today, 14),
        priority: 'High',
      }),
    ],
  };
}
