# Project: Pinterest Pin Publisher - Scheduled Posting System

## Architecture
The application runs on Electron + React + SQLite + Playwright.
- **Electron Main (`electron/main.ts`)**: Initializes DB, runs queue processor, and registers IPC handlers. It will now host the background Scheduler Engine (`setInterval` checking every 60s) and the System Tray + Auto-Start logic.
- **Database (`electron/database/db.ts`)**: Holds SQLite tables. Already has `scheduledDate` and `scheduledTime` columns in `queue_jobs` table.
- **Renderer (`src/`)**: React app. UI screens `Queue.tsx` and `Settings.tsx` will talk to the Main process via IPC Bridge (`electron/preload.ts`).

## Code Layout
- `electron/main.ts` - Main entry point, IPC handlers, background loops, tray initialization.
- `electron/types.ts` - Type definitions (including `QueueJob`).
- `electron/preload.ts` - Bridge exposing main APIs to the renderer window.
- `electron/database/db.ts` - Schema migrations and SQLite query runner.
- `src/screens/Queue.tsx` - Queue interface, scheduled tab, bulk schedule dialog.
- `src/screens/Settings.tsx` - Settings interface, scheduler toggles, startup settings.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | DB & Scheduler Engine | types.ts, main.ts, db.ts: 'scheduled' status, setInterval background loop, auto-firing jobs, ipc events, status handlers | none | DONE (by 5a6f29fe) |
| 2 | Auto-Start & Tray System | main.ts: app.setLoginItemSettings, tray icon, custom menu, tooltips, native notifications | M1 | DONE (by 53dee883) |
| 3 | Bulk Scheduler Distributor | Queue.tsx: bulk schedule dialog, even date/time distribution (30m spacing per account), preview, db saving | M1 | DONE (by afa6615a) |
| 4 | Queue & Settings UI | Queue.tsx, Settings.tsx: scheduled tab, countdown, inline date/time edit, unschedule action, settings toggles, status indicator | M2, M3 | DONE |
| 5 | E2E Integration & Hardening | E2E test suite running, bug fixes, adversarial coverage validation | M4 | DONE |

## Interface Contracts
### Renderer ↔ Electron Main (preload.ts / main.ts)
- `sys:setStartup(enabled: boolean)`: Registers or unregisters the app for launch at Windows startup.
- `sys:getStartup()`: Returns `{ openAtLogin: boolean, wasOpenedAtLogin: boolean }`.
- `scheduler:getStatus()`: Returns `{ active: boolean, nextJobTime: string | null, pendingCount: number }`.
- `scheduler:fired`: Event emitted from main to renderer containing `{ jobId: string }`.
