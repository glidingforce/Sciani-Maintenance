import { todayISO } from './dates';

export function backupFileName(mode: string, label = '') {
  return `scinai-maintenance-backup-${mode === 'demo' ? 'DEMO-' : ''}${label ? label + '-' : ''}${todayISO()}.json`;
}

/** Saves JSON as a file download (UTF-8, so Hebrew text is kept exactly). */
export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
