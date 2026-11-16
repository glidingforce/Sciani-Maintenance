# Scinai · Facility Maintenance

A personal maintenance workspace for daily focus, contractor and vendor follow-ups, and long-term next actions. It works on desktop and iPhone, uses the "Scinai Signature" design, and is hosted as one static page on GitHub Pages.

- **Sign-in:** your Scinai Microsoft account (Microsoft Entra app "Scinai Maintenance", browser PKCE flow, no client secret).
- **Storage:** one JSON file in a private app folder in your OneDrive: `Apps/Scinai Maintenance/maintenance-data.json`. You get the same records on every device where you sign in.
- **Outlook:** a 7-day agenda, plus explicitly scheduling a task as an event in your own calendar.

No task data is stored in this repository.

## Use it

Open `https://glidingforce.github.io/Sciani-Maintenance/` and sign in with Microsoft. The first time, Microsoft asks you to allow:
- `Calendars.ReadWrite`: your own calendar.
- `Files.ReadWrite.AppFolder`: only this app's folder in your OneDrive. The app cannot see your other files.

On iPhone: open the address in Safari, sign in, then Share → Add to Home Screen.

**Double-clicking `docs/index.html`** opens the app in "This device only" mode for testing. Microsoft sign-in only works from a web address.

## Storage behavior

- Every change is written to the OneDrive file with the file's version tag (eTag). If another device saved in between, the app re-reads the file and applies your single change again, so edits to different tasks on different devices are both kept. If the same task is edited on two devices, the later save wins.
- The app shows "Saved" only after OneDrive confirms. If a save fails (offline, sign-in expired, access refused), the change is undone on screen and the reason is shown.
- Other devices see changes when the app is opened, brought back to the foreground, or reloaded.
- **Backup:** account menu → Export backup (JSON). OneDrive's own version history also keeps earlier versions of the data file.
- **Restore** adds or overwrites by ID and never deletes records. Use it to move test records from "This device only" into OneDrive.
- **Demo data** is kept in a separate browser key and never mixed with real records.

## If OneDrive refuses

Microsoft documents app folders as working for work accounts, but an older Microsoft page says `Files.ReadWrite.AppFolder` is for personal accounts only. If sign-in works but the app shows **"OneDrive refused access to the app folder (403)"**:
1. Check API permissions in the Entra app. If "Admin consent required" shows Yes, or the status is not granted, ask IT to grant admin consent.
2. If it still fails, the fallback is the broader `Files.ReadWrite` permission (your own OneDrive files). That needs a small code change: tell Claude.
3. The long-term option is a SharePoint site created by IT (lists for tasks and for colleagues' malfunction reports).

## Outlook

- Recurring meetings show as individual occurrences. Times are in Israel time: Graph converts them using "Israel Standard Time", including daylight-saving changes.
- Only tasks you explicitly schedule go into Outlook, at most one event per task.
  - The event ID is stored on the task, so rescheduling updates the same event.
  - A Graph `transactionId` is saved before the first create, so a retry never creates a duplicate.
- An event moved in Outlook updates the task's scheduled time. An event deleted in Outlook marks the task "Removed from Outlook" and keeps the task. Calendar changes never complete a task.
- Refresh happens on opening the app, on returning to it, and on the Refresh button. A static page cannot run while it is closed, so there is no background sync.

## Entra app registration (already done)

| Setting | Value |
|---|---|
| Client ID | `85bc0418-f30d-483e-9eeb-fc04682ce3a9` |
| Tenant ID | `98944576-fbe3-4007-8f32-200ac12ad676` |
| Platform | Single-page application |
| Redirect URIs | `https://glidingforce.github.io/Sciani-Maintenance/` and `http://localhost:5173/` |
| Delegated permissions | `User.Read`, `Calendars.ReadWrite`, `Files.ReadWrite.AppFolder` |

The IDs are set in `src/config.ts`. They are not secrets. `Sites.ReadWrite.All` and `Sites.Manage.All` are not used by this version and can be removed from the registration.

## Publish on GitHub Pages

1. Upload the project, including the `docs` folder, to the repository.
2. Go to Settings → Pages → Source: **Deploy from a branch**, branch **main**, folder **/docs**.
3. After a code change, run `npm run build` and upload the new `docs/index.html`.

The repository name must stay `Sciani-Maintenance`, or the redirect URI in Entra must be updated to match.

## Develop (needs Node.js)

```bash
npm install
npm run dev      # http://localhost:5173 (sign-in works here too)
npm test         # unit tests
npm run build    # writes docs/index.html
```

## Project layout

```
src/
  App.tsx              shell, navigation, dialogs
  components/          Today, AllTasks, Contacts, TaskEditor, FollowUpDialog, ScheduleDialog, OutlookPanel, DataPanel, SignIn
  lib/tasks.ts         ordering, counts, follow-up logging
  lib/dates.ts         Asia/Jerusalem date handling
  auth/msal.ts         Microsoft sign-in
  storage/             OneDrive, local and demo storage
  outlook/graph.ts     calendar calls
  state/               useWorkspace (data + save state), useOutlook
  styles/tokens.css    Scinai design tokens
tests/                 unit tests (ordering, counts, follow-ups, storage, OneDrive merging, Outlook linking, DST)
docs/                  the built app (what GitHub Pages serves)
```
