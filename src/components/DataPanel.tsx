import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { Workspace } from '../state/useWorkspace';
import { convertToCurrent, makeBackup, planRestore, type ConvertResult, type RestoreMode } from '../lib/backup';
import { backupFileName, downloadJson } from '../lib/download';
import { SAFETY_KEYS } from '../storage/repo';
import { Sheet } from './Sheet';
import { getMyName, setMyName } from '../lib/settings';

const MODE_TEXT = {
  cloud: 'Your OneDrive (Apps / Scinai Maintenance). The same records on every device where you sign in with your Scinai account.',
  local: 'This device only. Records are saved in this browser and will not appear on your other devices.',
  demo: 'Demo data. Sample records kept apart from your real tasks.',
};

interface Pending {
  fileName: string;
  meta: { version: string; exportedAt?: string; mode?: string };
  conv: ConvertResult;
}

function safetyCopy(key: string): { label: string; data: unknown } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { label: parsed.savedAt ?? parsed.exportedAt ?? '', data: parsed.raw ? JSON.parse(parsed.raw) : parsed };
  } catch {
    return null;
  }
}

export function DataPanel({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(getMyName());

  async function readFile(file: File) {
    setMsg('');
    setPending(null);
    let parsed: Record<string, unknown>;
    try {
      // Read-only: the selected file itself is never modified.
      parsed = JSON.parse(await file.text());
    } catch {
      return setMsg('That file could not be read as a backup (not valid JSON). Nothing was changed.');
    }
    if (parsed?.mode === 'demo' && ws.mode !== 'demo') {
      return setMsg('That is a demo-data backup, so it was not restored into your real records.');
    }
    const conv = convertToCurrent(parsed);
    setRestoreMode('merge');
    setPending({
      fileName: file.name,
      meta: {
        version: typeof parsed.version === 'number' ? `schema ${parsed.version}` : 'first version (no version number)',
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt.slice(0, 16).replace('T', ' ') + ' UTC' : undefined,
        mode: typeof parsed.mode === 'string' ? parsed.mode : undefined,
      },
      conv,
    });
  }

  const d = pending?.conv.data;
  const plan = pending?.conv.ok && d ? planRestore(ws.data, d, restoreMode) : null;
  const stats = d && {
    open: d.tasks.filter((t) => !t.archived && t.status !== 'done').length,
    done: d.tasks.filter((t) => !t.archived && t.status === 'done').length,
    archived: d.tasks.filter((t) => t.archived).length,
    longTerm: d.tasks.filter((t) => t.kind === 'project').length,
    followUps: d.tasks.reduce((n, t) => n + (t.followUps?.length ?? 0), 0),
  };

  const preUpgrade =
    safetyCopy(`${SAFETY_KEYS.preUpgradeLocal}:v2`) ??
    safetyCopy(`${SAFETY_KEYS.preUpgradeCloud}:v2`) ??
    safetyCopy(SAFETY_KEYS.preUpgradeLocal) ??
    safetyCopy(SAFETY_KEYS.preUpgradeCloud);
  const preRestore = safetyCopy(SAFETY_KEYS.preRestore);

  return (
    <Sheet title="Data & backups" onClose={onClose}>
      <div className="form">
        <div>
          <span className="legend">Storage</span>
          <p style={{ marginTop: 4 }}>{MODE_TEXT[ws.mode]}</p>
          {ws.mode === 'cloud' && ws.account && <p className="subtle">Signed in as {ws.account.username}</p>}
          {ws.mode === 'local' && ws.cloudAvailable && (
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => ws.setLocalOnly(false)}>
              Switch to OneDrive (sign in)
            </button>
          )}
        </div>

        <label className="field">
          <span>Your name (shown instead of “Me”)</span>
          <div className="wait-actions">
            <input className="input" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMyName(name);
                window.location.reload();
              }}
            >
              Save name
            </button>
          </div>
        </label>
        <hr className="divider" />
        <div className="wait-actions">
          <button type="button" className="btn" onClick={() => downloadJson(makeBackup(ws.data, ws.mode), backupFileName(ws.mode))}>
            <Download className="icon" /> Export backup
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload className="icon" /> Restore from backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="subtle">
          Backups from every earlier version of this app can be restored. You see what the file contains before anything changes.
        </p>
        {msg && (
          <p role="status" className={msg.startsWith('Restored') ? '' : 'error-text'}>
            {msg}
          </p>
        )}

        {pending && (
          <section className="restore-preview" aria-label="Restore preview" data-testid="restore-preview">
            <span className="legend">Restore preview</span>
            <p>
              <b>{pending.fileName}</b>
              <br />
              <span className="subtle">
                Format: {pending.meta.version}
                {pending.meta.exportedAt ? ` · exported ${pending.meta.exportedAt}` : ''}
                {pending.meta.mode ? ` · from ${pending.meta.mode === 'cloud' ? 'OneDrive' : pending.meta.mode === 'local' ? 'one device' : pending.meta.mode}` : ''}
              </span>
            </p>
            {pending.conv.errors.length > 0 ? (
              <div className="error-text" role="alert">
                <p>
                  <b>This backup can't be restored. Nothing was changed.</b>
                </p>
                <ul>
                  {pending.conv.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : (
              stats && (
                <>
                  <p data-testid="restore-counts">
                    {d!.tasks.length} tasks ({stats.open} open, {stats.done} done, {stats.archived} archived, {stats.longTerm} long-term) ·{' '}
                    {d!.contacts.length} contacts · {stats.followUps} follow-up entries
                  </p>
                  {pending.conv.warnings.length > 0 && (
                    <details>
                      <summary className="linkish">{pending.conv.warnings.length} conversion notes</summary>
                      <ul className="subtle">
                        {pending.conv.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="segmented" role="radiogroup" aria-label="How to restore">
                    <button type="button" role="radio" aria-pressed={restoreMode === 'merge'} aria-checked={restoreMode === 'merge'} onClick={() => setRestoreMode('merge')}>
                      Merge
                    </button>
                    <button type="button" role="radio" aria-pressed={restoreMode === 'replace'} aria-checked={restoreMode === 'replace'} onClick={() => setRestoreMode('replace')}>
                      Replace
                    </button>
                  </div>
                  {plan && (
                    <p data-testid="restore-effect">
                      {restoreMode === 'merge'
                        ? `Merge: adds ${plan.added}, updates ${plan.updated}, leaves ${plan.unchanged} unchanged. Records are matched by ID; nothing is deleted and nothing is duplicated.`
                        : `Replace: your current ${ws.data.tasks.length} tasks and ${ws.data.contacts.length} contacts are replaced by the backup. ${plan.removed} current records that are not in the backup will be removed. A copy of your current data downloads first.`}
                    </p>
                  )}
                  <div className="wait-actions">
                    <button type="button" className="btn" onClick={() => setPending(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`btn btn-primary${restoreMode === 'replace' ? ' btn-danger-fill' : ''}`}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const r = await ws.restore(d!, restoreMode);
                        setBusy(false);
                        setPending(null);
                        setMsg(r.ok ? `Restored ${d!.tasks.length} tasks and ${d!.contacts.length} contacts (${restoreMode}).` : r.message);
                      }}
                    >
                      {busy ? 'Restoring…' : restoreMode === 'merge' ? 'Merge into my data' : 'Replace my data'}
                    </button>
                  </div>
                </>
              )
            )}
          </section>
        )}

        {(preUpgrade || preRestore) && (
          <>
            <hr className="divider" />
            <div>
              <span className="legend">Automatic safety copies (this browser)</span>
              <div className="wait-actions" style={{ marginTop: 6 }}>
                {preUpgrade && (
                  <button type="button" className="btn" onClick={() => downloadJson(preUpgrade.data, backupFileName(ws.mode, 'before-upgrade'))}>
                    <Download className="icon" /> Before the upgrade
                  </button>
                )}
                {preRestore && (
                  <button type="button" className="btn" onClick={() => downloadJson(preRestore.data, backupFileName(ws.mode, 'before-last-restore'))}>
                    <Download className="icon" /> Before the last restore
                  </button>
                )}
              </div>
            </div>
          </>
        )}

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
