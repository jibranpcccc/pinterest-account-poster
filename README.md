# Pinterest Pin Publisher — Project Briefing

> **For any AI agent continuing work on this project — read this first.**

---

## What Is This Project?

**Pinterest Pin Publisher** is a desktop automation app built with **Electron + Playwright + React**.

It lets a user manage multiple Pinterest accounts and automatically publish pins to Pinterest boards — including uploading images, filling titles, descriptions, alt text, selecting boards, and optionally scheduling posts — all through a real Chromium browser controlled by Playwright.

The app has a full UI (React/TypeScript frontend) where the user creates pins, manages accounts, runs a publish queue, and monitors logs.

---

## The Goal

Build a **reliable, modern, production-ready Pinterest automation tool** that:

1. **Auto-manages Pinterest sessions** — opens a real browser for manual login, saves cookies, verifies sessions automatically
2. **Publishes pins reliably** — uploads images, fills all metadata, selects boards, clicks Publish — without breaking when Pinterest changes its DOM
3. **AI-powered SEO** — generates keyword-optimised titles, descriptions, alt text and keyword clouds using 2026 Pinterest ranking best practices
4. **Handles bulk uploads** — CSV/Excel import + image matching + AI-autogenerate mode for hundreds of pins at once
5. **Modern premium UI** — glassmorphism dark theme, animated stat cards, live progress bars, log console

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron (Node.js main process) |
| Browser automation | Playwright (`chromium.launchPersistentContext`) |
| Frontend UI | React 18 + TypeScript + Vite |
| Styling | TailwindCSS + inline styles |
| Database | SQLite via `better-sqlite3` |
| AI | OpenCode API (Cloudflare-proxied Llama 4 Scout) |
| IPC | Electron `ipcMain`/`ipcRenderer` via contextBridge preload |

---

## Project File Structure

```
pinterest account poster/
├── electron/                           # Electron main process (Node.js)
│   ├── main.ts                         # App entry, IPC handlers, media protocol handler
│   ├── preload.ts                      # Context bridge — exposes safe API to renderer
│   ├── database/
│   │   └── db.ts                       # DbManager — SQLite + all CRUD + migrations
│   ├── publisher/
│   │   ├── publisherAdapter.ts         # Orchestrates the queue, calls executor per job
│   │   ├── publishExecutor.ts          # Playwright: login → upload → fill → board → publish
│   │   ├── pinterestSessionAdapter.ts  # Opens login browser, verifies session status
│   │   ├── boardResolver.ts            # Scrapes Pinterest boards list for an account
│   │   └── fingerprintManager.ts      # Per-account browser fingerprint (UA, viewport, etc.)
│   └── ai/
│       └── openCodeProvider.ts         # AI: titles, descriptions, keywords, alt text
├── src/                                # React renderer (UI)
│   ├── App.tsx                         # Root: sidebar nav, screen routing, global state
│   ├── screens/
│   │   ├── Dashboard.tsx               # Stats cards, recent jobs, activity log
│   │   ├── CreatePin.tsx               # Single pin composer + Bulk CSV/AI importer
│   │   ├── Queue.tsx                   # Live queue with progress, console, controls
│   │   ├── Accounts.tsx                # Account cards, connect/verify/delete
│   │   ├── Drafts.tsx                  # Saved draft templates
│   │   ├── Logs.tsx                    # System logs: filter, search, copy, CSV export
│   │   └── Settings.tsx                # App settings (AI keys, delays, headless, etc.)
│   ├── components/
│   │   ├── Card.tsx                    # Glassmorphism card container
│   │   ├── Button.tsx                  # Button variants (primary/secondary/ghost/ai)
│   │   ├── Modal.tsx                   # Dialog overlay component
│   │   ├── PreviewCard.tsx             # Live Pinterest-style 2:3 pin preview
│   │   ├── SeoAudit.tsx                # Live SEO checklist panel
│   │   └── QueueItemRow.tsx            # Queue row with status, progress, Copy Pin URL
│   ├── services/
│   │   └── api.ts                      # Frontend → IPC bridge
│   ├── types.ts                        # Shared TypeScript types
│   └── index.css                       # Global styles, glassmorphism, animations
└── scripts/
    └── build.js                        # Custom build script (tsc + vite)
```

---

## Database Schema (SQLite)

**Tables:** `accounts`, `boards`, `drafts`, `queue_jobs`, `settings`, `logs`

Key columns:
- **accounts:** `id`, `nickname`, `email`, `password`, `profilePath`, `sessionStatus`, `lastUsedAt`
- **queue_jobs:** `id`, `accountId`, `boardName`, `boardUrl`, `imagePath`, `title`, `description`, `altText`, `destinationUrl`, `status`, `scheduledDate`, `scheduledTime`, `livePinUrl`, `screenshotPath`
- **settings:** flat key-value store — `headlessQueue`, `aiEnabled`, `aiProvider`, `aiBaseUrl`, `pinDelay`, `accountDelay`, `maxRetries`, `mockMode`, etc.

---

## What Has Been Fully Completed

### Critical Bug Fixes (All Done)

1. **Session verification** — Navigates to `/settings/account/` which Pinterest always redirects logged-out users away from. Reliable logged-in/out detection.

2. **Image upload** — Uses Playwright `waitForEvent('filechooser')` to intercept the native OS file dialog. No more fragile `setInputFiles` on hidden inputs.

3. **Board selection** — Uses `[data-test-id="board-drop-item"]` + `.innerText` comparison. Robust against Pinterest DOM changes.

4. **Headless mode default** — `headlessQueue` defaults to `false` (visible browser). File upload dialogs do not work in headless mode.

5. **Alt text selectors** — Updated to `[data-test-id="pin-draft-alt-text-button"]` for current Pinterest DOM.

6. **Auto-login on startup** — `performStartupAutoLogin()` fires 3 seconds after app launch. Checks all accounts with saved credentials, silently re-authenticates if session expired. Stuck `running` jobs reset to `pending` on DB init.

7. **Auto-relogin during publish** — If session expires mid-job and account has email+password stored, executor re-authenticates before failing the job.

### AI SEO (Done — 2026 Pinterest Algorithm)

File: `electron/ai/openCodeProvider.ts`

- **5-minute in-memory cache** for Cloudflare key pool (prevents repeated disk reads per bulk session)
- **Exponential backoff** on 429 rate-limit errors (up to 8s delay with jitter, 5 retries)
- **Title prompts:** front-load primary keyword in first 3–5 words, 40–75 chars, 1 natural emoji, power words
- **Description prompts:** keyword in opening sentence, board anchor in first 2 sentences, 150–250 chars, CTA + 3–5 niche hashtags
- **Keywords:** 15 keywords with semantic clustering (1-word, 2-word, 3-word phrase mix)
- **Alt text:** 80–200 chars, describes visual scene, primary keyword included once
- **Validation:** 7-dimension quality audit returning specific actionable warnings

### UI (Done — Full Modernization)

- **Sidebar:** Gradient logo, active-screen glow indicator, pulsing queue count badge, live status dot
- **Dashboard:** Animated glow stat cards, quick-action bar, colorful activity log with level badges
- **Queue:** Gradient animated progress bars, live scrolling log console, job thumbnail during publish, pause/resume/stop controls
- **Accounts:** Card grid with avatar initials, pulsing green dot for connected accounts, per-card warnings
- **CreatePin AI Panel:** Premium suggestion cards with `✓ Ideal` / `↑ Short` / `↓ Long` character count badges, hover glow, `✓ Applied!` success toast, clickable keyword cloud chips that inject `#hashtags` into description
- **Bulk AI Mode:** Animated gradient violet progress bar with spinning icon, `X/Y images` badge, `% done` readout with glow
- **Logs:** Level filter + keyword search + Copy to Clipboard + **Export CSV** (downloads `pinterest-logs-YYYY-MM-DD.csv`)

---

## How the Publish Flow Works (End-to-End)

```
User clicks "Publish" in Queue
        ↓
publisherAdapter.processQueue(jobIds)
        ↓
For each job:
  1. sessionAdapter.closeLoginSession()       ← release browser profile lock
  2. executor.executeJob(job, account, settings)
        ↓
  Inside executeJob:
  3. chromium.launchPersistentContext(profileDir, { headless: false })
  4. page.goto('https://www.pinterest.com/pin-builder/')
  5. Check URL → if not on pin-builder → auto-login with saved credentials
  6. waitForEvent('filechooser') → upload image file
  7. typeSlowly() → fill Title, Description, Destination URL
  8. Click alt text button → fill Alt Text
  9. Click board dropdown → search name → click [data-test-id="board-drop-item"]
  10. Optional: set scheduled date/time
  11. Click Publish button
  12. Wait for /pin/ URL → save livePinUrl to DB
  13. context.close()
        ↓
  Pacing delay (10–30s same account, 30–60s on account switch)
        ↓
  Next job...
```

---

## How Session Verification Works

```
verifySession(account):
  1. Close any open browser for this account
  2. Launch headless Chromium with saved profile directory
  3. Navigate to https://www.pinterest.com/settings/account/
  4. Wait 4 seconds for client-side redirects
  5. Check current URL:
     - Contains /settings → LOGGED IN  ✅  sessionStatus = 'connected'
     - Redirected to / or /login       ❌  sessionStatus = 'disconnected'
  6. Save result to accounts table in DB
  7. Close browser
```

---

## How AI Generation Works

```
User clicks "Suggest Titles" in CreatePin
        ↓
api.callAI('generateTitleSuggestions', { topic, keyword, boardName, ... })
        ↓
openCodeProvider.generateTitleSuggestions()
        ↓
  1. syncCloudflareKeysPool() — use 5min in-memory cache or read from disk
  2. Pick random available API key from pool
  3. POST to OpenCode API (Cloudflare-proxied Llama 4 Scout)
     with 2026 Pinterest SEO-optimised prompt
  4. If 429 → exponential backoff retry (up to 5 attempts)
  5. Parse JSON array from response
  6. Return 3–5 suggestions
        ↓
UI displays premium cards with char count badges
User clicks card → applies to field + shows "✓ Applied!" toast
```

---

## Important Behaviours to Know

- **Browser profiles** live in `userData/local-data/profiles/<accountId>/` — each account has its own isolated Chromium profile with saved cookies. Never point two jobs at the same profile simultaneously.
- **Mock Mode** (`settings.mockMode = true`) simulates publishing without touching Pinterest — useful for testing queue logic
- **Fingerprint spoofing** — each account gets a stable random browser fingerprint (UA, viewport, platform, language) that persists via `fingerprintManager.ts`
- **DevTools auto-open** is active (`main.ts` line 65: `mainWindow.webContents.openDevTools()`) — remove this before packaging for end users
- **Cloudflare key pool** — AI keys are stored in `cloudflare_working_accounts.txt` and `~/.hermes/.env`. The provider rotates keys on rate limits automatically
- **`livePinUrl`** is saved to `queue_jobs.livePinUrl` after successful publish — shown in Queue UI with a "Copy URL" button

---

## Remaining Future Work

1. **Remove DevTools auto-open** in `main.ts` line 65 before shipping to end users
2. **Date-range filter in Logs screen** — level filter and keyword search exist, but date picker is not yet implemented
3. **Board refresh button in UI** — `boardResolver.ts` works but has no per-account refresh trigger in the Accounts screen
4. **App packaging** — no `electron-builder` config yet; needs a `package:win` script
5. **Error screenshots in Queue** — failure screenshots are saved to `local-data/screenshots/` but not displayed inline in the Queue UI

---

## Build Commands

```bash
# Development (hot reload)
npm run dev

# Production build (TypeScript + Vite bundle)
npm run build

# Run the Electron app after build
npm start
```

**Last verified build:** `npm run build` → ✅ 0 TypeScript errors · 1521 modules · 337KB JS · 41KB CSS · Built in 11s
