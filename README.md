# Scinai · Facility Maintenance

A personal maintenance workspace for daily focus, follow-ups with contractors and vendors, and long-term next actions. It works on desktop and iPhone and uses the "Scinai Signature" design.

- **Frontend:** React + TypeScript + Vite, hosted as static files on GitHub Pages.
- **Shared storage:** Supabase (Postgres + row-level security + email sign-in). Optional. Without it, the app runs in a clearly labeled **This device only** mode.
- **Outlook:** Microsoft sign-in (MSAL, PKCE) + Microsoft Graph, using delegated `Calendars.ReadWrite`. Optional. While it is not configured or not connected, the app shows only a small "Connect Outlook" entry.

No task data lives in this repository. Backups that you export are git-ignored.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: fill in Supabase / Microsoft values
npm run dev                  # http://localhost:5173
npm test                     # unit tests
npm run build                # production build in dist/
```

## Storage modes

| Mode | When | Where the records live |
|---|---|---|
| Shared | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set | Supabase. You get the same records on every device where you sign in. |
| This device only | Supabase is not configured | This browser's localStorage. Not synced to other devices. |
| Demo | Turned on from the account menu | A separate localStorage key. Never mixed with real records. |

**Export backup** (account menu) downloads all records as JSON. **Restore** adds records from a backup or overwrites them by ID. It never deletes anything. Use it to move "This device only" records into shared storage after you set that up.

## Shared storage (Supabase), about 10 minutes

1. Create a free project at <https://supabase.com>. Pick an EU region (for example Frankfurt).
2. In **SQL Editor**, run `supabase/schema.sql`. This creates the `tasks` and `contacts` tables, restricted to their owner by row-level security.
3. In **Authentication → Users → Add user**, create your own user with your email.
4. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**. The app also asks Supabase not to create users (`shouldCreateUser: false`).
5. In **Authentication → Emails → Magic Link**, add `{{ .Token }}` to the template so the email includes a 6-digit code. The code is how you sign in from the iPhone home-screen app, because email links open in Safari instead.
6. In **Authentication → URL Configuration**, set **Site URL** to your Pages URL (`https://<user>.github.io/<repo>/`) and add it under **Redirect URLs**.
7. Copy **Project URL** and the **anon public** key (Project Settings → API).

The anon key is meant to be public. Your data is protected by row-level security and your sign-in.

## Outlook 365 (needs your Microsoft 365 tenant, possibly IT approval)

1. Go to Entra admin center → **App registrations → New registration**.
   - Name: `Scinai Maintenance`. Supported accounts: *this organizational directory only*.
   - Redirect URI: platform **Single-page application (SPA)**, value `https://<user>.github.io/<repo>/` (with the trailing slash). Also add `http://localhost:5173/` for local development.
2. **API permissions → Add → Microsoft Graph → Delegated → `Calendars.ReadWrite`**. `User.Read` is already present. If your organization blocks user consent, ask IT to **Grant admin consent**.
3. Do **not** create a client secret. The app is a public client and uses the browser PKCE flow.
4. Copy **Application (client) ID** and **Directory (tenant) ID**.

How the integration behaves:
- After you connect, the Today page shows the next 7 days of your own calendar. Recurring meetings show as individual occurrences.
- Only tasks you explicitly schedule go into Outlook ("Schedule in Outlook" in a task). Each task has at most one linked event.
  - The event ID is stored on the task, so rescheduling updates the same event.
  - A Graph `transactionId` is saved before the first create, so if the create is retried after a lost response, Graph returns the same event instead of making a duplicate.
- If you move a linked event in Outlook, the task shows the new time after the next refresh. If you delete it in Outlook, the task shows "Removed from Outlook" and the task itself is kept. Calendar changes never complete a task. Renaming a task updates the event title if the title hadn't been changed in Outlook.
- Refresh happens when you open the app, when you return to it, and when you press Refresh. **A static site cannot run while it is closed.** Continuous background sync would need a server with Graph change notifications, and that is not included.
- Times are entered and shown in Israel time (`Asia/Jerusalem`, Graph zone `Israel Standard Time`). Graph converts them to and from Israel time, including daylight saving changes. The browser's own time zone is never used for date arithmetic.
- If company policy blocks the app, leave the Microsoft values empty. The dashboard works fully without a calendar.

## Deploy to GitHub Pages

1. Create a **private or public** repo and push this folder. The code contains no secrets and no task data.
2. Go to **Settings → Pages → Source: GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions → Variables** and add the variables you have:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MS_CLIENT_ID`, `VITE_MS_TENANT_ID`.
4. Push to `main`. The workflow runs the tests, builds with `BASE_PATH=/<repo>/`, and publishes.
5. On iPhone, open the URL in Safari, then tap **Share → Add to Home Screen**.

Note: GitHub Pages sites are public even when the repository is private (unless you use Enterprise access control). That is fine here: the page holds no data, and records are only readable after sign-in.

## Project layout

```
src/
  App.tsx                 shell, navigation, dialogs
  components/             Today, AllTasks, Contacts, TaskEditor, FollowUpDialog, ScheduleDialog, OutlookPanel, DataPanel, SignIn
  lib/tasks.ts            ordering, counts, follow-up logging (pure functions)
  lib/dates.ts            Asia/Jerusalem date handling
  storage/                local, demo and Supabase repositories
  outlook/                MSAL sign-in and Graph calendar calls
  state/                  useWorkspace (data + save state), useOutlook
  styles/tokens.css       Scinai design tokens
supabase/schema.sql       tables + row-level security
tests/                    unit tests (ordering, counts, follow-ups, storage, Outlook linking, DST)
```

Daily ordering puts overdue unfinished work first, then priority (High → Normal → Low), then due date. Counts come straight from the saved records. The app never assigns safety or regulatory criticality on its own; priority is whatever you set.
