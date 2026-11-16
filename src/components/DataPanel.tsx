import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { Dataset } from '../types';
import type { Workspace } from '../state/useWorkspace';
import { todayISO } from '../lib/dates';
import { Sheet } from './Sheet';

const MODE_TEXT = {
  cloud: 'Your OneDrive (Apps / Scinai Maintenance). The same records on every device where you sign in with your Scinai account.',
  local: 'This device only. Records are saved in this browser and will not appear on your other devices.',
  demo: 'Demo data. Sample records kept apart from your real tasks.',
};

export function DataPanel({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  function exportData() {
    const payload = { app: 'scinai-maintenance', version: 1, exportedAt: new Date().toISOString(), mode: ws.mode, ...ws.data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scinai-maintenance-backup-${ws.mode === 'demo' ? 'DEMO-' : ''}${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Dataset> & { app?: string; mode?: string };
      if (parsed.app !== 'scinai-maintenance' || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.contacts)) {
        return setMsg('That file is not a backup from this app.');
      }
      if (parsed.mode === 'demo' && ws.mode !== 'demo') return setMsg('That is a demo-data backup; it was not imported into your real records.');
      const ok = await ws.restore({ tasks: parsed.tasks, contacts: parsed.contacts });
      setMsg(ok ? `Restored ${parsed.tasks.length} tasks and ${parsed.contacts.length} contacts.` : 'Restore failed; see the message below.');
    } catch {
      setMsg('Could not read that file.');
    }
  }

  return (
    <Sheet title="Data & accounts" onClose={onClose}>
      <div className="form">
        <div>
          <span className="legend">Storage</span>
          <p style={{ marginTop: 4 }}>{MODE_TEXT[ws.mode]}</p>
          {ws.mode === 'cloud' && ws.account && <p className="subtle">Signed in as {ws.account.username}</p>}
          {ws.mode === 'local' && (
            <p className="subtle">To use the same tasks on every device, open the app from its web address and sign in with Microsoft.</p>
          )}
          {ws.mode === 'local' && ws.cloudAvailable && (
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => ws.setLocalOnly(false)}>
              Switch to OneDrive (sign in)
            </button>
          )}
        </div>
        <div className="wait-actions">
          <button type="button" className="btn" onClick={exportData}>
            <Download className="icon" /> Export backup
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload className="icon" /> Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="subtle">
          Restore adds or overwrites records by ID; it never deletes records that are not in the backup. Use it to move “This device only”
          records into your OneDrive.
        </p>
        {msg && <p role="status">{msg}</p>}
        <hr className="divider" />
        <div>
          <span className="legend">Demo</span>
          <div className="wait-actions" style={{ marginTop: 6 }}>
            {ws.mode === 'demo' ? (
              <>
                <button type="button" className="btn" onClick={() => ws.setDemo(false)}>
                  Exit demo
                </button>
                <button type="button" className="btn" onClick={() => void ws.resetDemo()}>
                  Reset demo data
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => ws.setDemo(true)}>
                Try with demo data
              </button>
            )}
          </div>
        </div>
        {ws.mode === 'cloud' && ws.account && (
          <>
            <hr className="divider" />
            <button type="button" className="btn" onClick={() => void ws.signOutCloud()}>
              Sign out on this device
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
