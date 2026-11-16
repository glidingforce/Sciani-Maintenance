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

**Without Microsoft sign-in** (for example while waiting for IT approval): on the sign-in screen choose **Use on this device only**. Double-clicking `docs/index.html` also opens this mode. Tasks then stay in that browser. When sign-in works, use Export backup, then **Switch to OneDrive** in the account menu, then Restore.

## Today page

Four priority cards show all open work that is overdue, due today, due for follow-up, or waiting. Tap a card to focus the list; tap it again or choose Show all to clear that focus. Work due dates include project milestones; follow-up dates remain separate. Card totals always describe the whole workspace.

**Desktop (wider than 1100 px):** the task list is on the left, and the right column shows:
- an At a glance card with counts for coming up, not scheduled, waiting, blocked, and closed in the last 7 days. Tap Waiting or Blocked to filter.
- long-term work.
- Done today.
- Outlook.

**Phones:** a single column, with the filters folded behind a "Filters" button.

**Filters:** Today and All Tasks share search (task, equipment, room, person, notes), responsible (you, others, or one person), area or room, priority, and status (including Blocked). Choose Filters to expand the selectors. Sort by urgency, work due date, priority, or oldest first; Today keeps its urgency groups and sorts within each group. Quick add expands on demand, with optional date, owner, and priority controls.

**Rows:** each row's right-hand column shows the responsible person, the equipment (name · number · room), and the area. Task age appears in the list after 14 days and is highlighted; the editor and reports keep the full creation-date details. Next actions appear in both Today and All Tasks.

**Task editor:** fields are grouped into Task details, Equipment & location, Schedule & priority, and Responsibility & follow-up. Blockers, management actions, and notes expand separately. The form scrolls while its header and action buttons stay visible.

**Contacts:** search by name, company, type, phone, or email. Each card shows linked open-task counts and the earliest recorded follow-up date, with overdue follow-ups highlighted.

Your own tasks show your name ("Ilan") instead of "Me". You can change the name under account menu → Data & backups. It is stored on the device only; task records still say `owner: "me"`, so changing the name never changes task data.

One list, every open task exactly once, in the most urgent group that applies:

1. **Needs attention:** work overdue or due today, and follow-ups due today or overdue.
2. **Coming up:** work or follow-ups in the next 7 days.
3. **Not scheduled:** open tasks with no due date and no follow-up date.
4. **Later:** dates more than 7 days away (collapsed).
5. **Long-term work:** projects without a near date (collapsed). A project moves up when its milestone or follow-up is due.

Each row shows why it is there ("Overdue · 12 Nov", "Due today", "Follow-up due", "Blocked"), who it is waiting for and for what, and the next action. It also has buttons: Call (when a phone number is recorded), Log update, and the ⋯ menu. Records that are missing something useful show a small "+ Add …" link. Nothing is filled in automatically.

Due date, follow-up date, responsible party and next action are separate fields. "Waiting" (on someone) and "Blocked" (a blocker is recorded) are tracked separately.

## Management report (PDF)

Export report → choose filters (all optional) → Create PDF. By default it includes every unfinished task, including waiting and unscheduled ones.
- **Header:** Scinai logo, generation time, the filters applied, and counts (open, overdue, high priority, waiting, blocked).
- **Columns:** task, area/equipment, responsible, status and priority, work due date, next action and follow-up date, blocker and management action.
- **Layout:** landscape A4 with column headers repeated on every page, page numbers, and wrapped text. Hebrew and mixed Hebrew/English text are drawn right to left using the embedded Rubik font (SIL OFL).
- **Opened:** an Opened column shows the creation date and days open.
- **Closed tasks:** a separate page lists tasks closed in the last 7 days (today and the 6 days before, by Israel date), with opened date, closed date and days open. The area/room, responsible and priority filters apply to it too.
- **Not included:** contact phone numbers, e-mails and notes.
- **Due-date filter:** using it excludes tasks that have no due date. The dialog and the report both say so.

## Data format, upgrades and backups

| Format | Where it came from | Accepted on restore |
|---|---|---|
| Schema 3 | This version: exports (`"version": 3`), browser storage (`"schemaVersion": 3`) and the OneDrive file | Yes |
| Schema 2 | Second release (with waiting / blocker / management fields) | Yes, converted unchanged |
| Schema 1 | First release: exports (`"version": 1`) and the OneDrive file | Yes, converted |
| No version | First release: raw browser storage `{ tasks, contacts }`, or hand-made files | Yes, converted |
| Newer than 3 | A future version | No (the app asks you to update first) |

Schema 2 **added** optional fields (`waitingFor`, `waitingWhat`, `blocker`, `managementAction`, and `nextAction` on any task). Schema 3 **adds** `equipmentName`, `equipmentNumber` and `room`. No fields were ever renamed or removed, so records from earlier releases convert unchanged:
- **Preserved:** IDs, titles, notes, dates, status, priority, contacts, links between tasks and contacts, follow-up history, Hebrew text, and any unknown fields.
- **Normalized values:** priority and status values written differently (for example "high", "In progress", "completed") are mapped explicitly. Values that can't be mapped are kept under `_legacy` on the record, with a note.
- **Dates:** date-only values are copied as text. A timestamp is cut to its own written date, never converted through a time zone. Non-dates are kept under `_legacy` and the field is left empty.
- **Records:** a record with no ID gets a new ID, and a duplicated ID keeps the most recently updated copy, both with a note. An entry that isn't a record at all blocks the restore, so nothing is dropped silently.

**In-place upgrade:** the first time this version opens older browser data, it saves an untouched copy, one per source version (account menu → Data & backups → "Before the upgrade"), then rewrites the data in schema 3. Opening it again changes nothing. Older OneDrive files are converted in memory and rewritten on the next save; OneDrive's version history keeps the old file, and a copy is kept in the browser.

**Restore:** the selected file is only read. It is validated and converted first, and a preview shows its record counts, conversion notes and the effect of the restore.
- **Merge** matches by ID: it adds or updates and never deletes or duplicates.
- **Replace** downloads a copy of your current data first.
- Both keep a copy in the browser ("Before the last restore") and write the result in one step. If anything fails, current data is not changed.

## Storage behavior

- Every change is written to the OneDrive file with the file's version tag (eTag). If another device saved in between, the app re-reads the file and applies your single change again, so edits to different tasks on different devices are both kept. If the same task is edited on two devices, the later save wins.
- The app shows "Saved" only after OneDrive confirms. If a save fails (offline, sign-in expired, access refused), the change is undone on screen and the reason is shown.
- Other devices see changes when the app is opened, brought back to the foreground, or reloaded.
- **Backup:** account menu → Export backup (JSON). OneDrive's own version history also keeps earlier versions of the data file.
- To move records from "This device only" into OneDrive: Export backup, sign in, then Restore with **Merge**.
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
  lib/backup.ts        schema versions, legacy conversion, restore planning
  lib/report.ts        report selection and counts
  report/              PDF builder, bidi handling, embedded fonts
  outlook/graph.ts     calendar calls
  state/               useWorkspace (data + save state), useOutlook
  styles/tokens.css    Scinai design tokens
tests/                 unit tests incl. restore of real first-release backups (tests/fixtures)
docs/                  the built app (what GitHub Pages serves)
```
