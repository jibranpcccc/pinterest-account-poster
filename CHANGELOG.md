# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.45] - 2026-07-20
### Fixed
- **Timezone and Locale String Parsing**: Fixed a critical background scheduler bug where dates saved in US formatting (e.g. `MM/DD/YYYY` or `MM/DD/YYYY hh:mm AM/PM` with slash separators) would return `Invalid Date` on the Electron main process due to strict ISO `YYYY-MM-DDTHH:mm:ss` constructors.
- **Robust Multi-Locale Parser**: Replaced all string-based Date parsing with a format-agnostic, timezone-neutral parser using integer date components (`new Date(year, month - 1, day, hour, minute, second)`), standardizing locale handling across the renderer UI (`Queue.tsx`, `QueueItemRow.tsx`) and main process (`main.ts`).
- **Live Overdue Status**: Resolved a bug where countdown timers would display `"Posts in 0m"` or `"NaNm"` on timezone offset shifts, ensuring overdue items correctly display `"Overdue — posting soon"`.

## [1.0.44] - 2026-07-20
### Added
- **Background Scheduler Engine**: Integrated a Node.js `setInterval` background scheduler (running every 60 seconds) in the Electron main process to query, identify, and fire scheduled pins automatically when their target time arrives.
- **Windows Auto-Start**: Exposed startup registration handlers (`sys:setStartup`, `sys:getStartup`) that toggle "Launch at Windows startup" using Electron's `app.setLoginItemSettings()`.
- **System Tray Silent Launch**: Configured the app to launch hidden in the Windows system tray on boot. The tray icon features right-click Open/Quit options and a dynamic status tooltip showing queue metrics.
- **Desktop Toast Notifications**: Added native OS notification bubbles that trigger when a scheduled pin is successfully posted or fails.
- **Smart Bulk Distributor**: Re-engineered the bulk schedule distribution algorithm with the following constraints:
  - Enforced a daily limit of **7 posts per board** max.
  - Enforced a daily limit of **40 posts per account** max.
  - Interleaved selected pending pins round-robin by board name (Board A -> Board B -> Board C -> Board A...) for equal representation.
  - Added **Dynamic Date Extension**: Automatically stretches the date range if the selected timeline is too narrow to fit pins under the daily board/account limits.
  - Improved collision checks (forcing a minimum 30-minute separation per account).
- **Scheduled Queue UI**:
  - Added a dedicated "Scheduled" tab to show scheduled jobs sorted chronologically.
  - Added live countdown timers refreshing every second (*"Posts in Xd Xh Xm"*).
  - Added inline date/time editors to update scheduled slots directly from the table.
  - Added an "Unschedule" action to revert jobs back to `pending` status.
- **E2E & Stress Test Verification**: Overhauled testing to achieve **50/50 Playwright E2E cases** passed, including boundary condition stress tests for date timezone overlaps, DST transitions, and load spikes.

## [1.0.10] - 2026-07-08
### Added
- **Automated CI/CD**: Added a GitHub Actions workflow (`.github/workflows/release.yml`) to automatically build and publish the Windows `.exe` executable to GitHub Releases.
- **Secure Key Bundling**: Automated the secure injection of Cloudflare AI keys into the `.exe` during the GitHub Actions build process using GitHub Secrets.
- **Universal SEO Standard**: Introduced a single source of truth `PINTEREST_RULES` constant in `openCodeProvider.ts` to enforce strict character counts and formatting rules across all AI generation and validation functions.
- **Final Normalizer**: Added `normalizeFinalSEO()` to catch and clean final AI outputs before publishing, preventing mid-sentence cutoffs and formatting drift.

### Changed
- **Pinterest SEO Prompt Finalization**: Replaced the Kimi AI SEO metadata prompt with the absolute latest expert master prompt. The new instructions strictly enforce 5 rotation CTAs, strictly ban specific clickbait vocabulary ("stunning", "must-have", "viral"), strictly enforce inclusive language ("person", "someone with", avoiding ethnicity/gender unless explicitly dictated by the input prompt), and emphasize the visual data as the sole source of truth with extreme prejudice to prevent any hallucinations of accessories, extensions, or styles not present in the image prompt.
- **Character Limits Enforced**: Titles now strictly 45-85 characters, Descriptions 220-380 characters (ending with a complete sentence), and Alt Text 12-22 words.
- **Formatting Constraints**: Disabled emojis, hashtags, and pipe (`|`) symbols by default for a cleaner, spam-free aesthetic.
- **Vision Analysis Certainty**: Reduced default AI vision confidence from `0.95` to `0.7` to prevent hallucination of details not explicitly present in images.

### Fixed
- **Electron File System**: Modified `LOCAL_CF_STATUS_PATH` to write to the writable Electron `userData` folder in production builds to prevent ASAR read-only crash errors on packaged executables.

## [1.0.9] - 2026-07-07
### Changed
- **Universal Global SEO Prompt**: Completely overhauled the Pinterest SEO generation prompt to be universal and inclusive for all global hairstyles, demographics, genders, ethnicities, and hair patterns (men, women, kids, straight, curly, coily, fades, etc.) instead of hardcoding rules specifically for Black women's hairstyles. It now dynamically extracts gender and hair type strictly from the input data while maintaining the high-quality metadata structures.

## [1.0.8] - 2026-07-07
### Changed
- **Pinterest SEO Prompt Optimization**: Overhauled the backend Kimi Stage 2 SEO generation prompt based on expert hairstyle-niche copywriting guidelines (mandating proper capitalization for "Black women", strict 220–380 character descriptions, title formatting constraints without emojis/hashtags/pipe symbols, visual details verification, and soft CTA rotations).

## [1.0.7] - 2026-07-07
### Added
- **Board Name/URL Column Mapping**: Added a column mapping selector for Board Name/URL to the spreadsheet importer. You can now map a spreadsheet column containing custom board names or custom board URLs directly. The parser automatically assigns these custom target boards per pin in the compiled grid, allowing pins in a single batch to be enqueued to completely different Pinterest boards automatically.

## [1.0.6] - 2026-07-07
### Added
- **Pasted Text Table Importer**: Added a secondary input toggle in the spreadsheet uploader component, allowing users to copy tables directly from Excel/Google Sheets and paste them in tab-separated/comma-separated format. The app automatically parses rows and columns, mapping them matching titles, descriptions, and boards.

## [1.0.5] - 2026-07-07
### Redesigned
- **Bulk Uploader Step-by-Step UI Layout**: Restructured the config layout in the bulk importer panel to follow flat sibling-step cards (Step 1: Upload, Step 2: Destination Link, Step 3: Target Boards, Step 4: Image Generation Prompts, Step 5: Compile & Add Batch, Step 6: Mapping Preview Grid). Removed nested card components to clean up structural visuals.

### Added
- **Multi-Line Generation Prompts**: Added a dedicated textarea to input one-to-one image generation prompts corresponding to the uploaded image order.
- **Bulk Load Text File**: Added a file selector button to load custom prompt text files (`.txt`/`.csv`) in bulk.
- **Copy All Text Button**: Added a native Electron clipboard utility button in the Mapping Preview Grid header to copy all compiled pin metadata to the clipboard at once.
- **Bulk Apply Utility Panel**: Added a header-collapsible utility bar to bulk-apply title, description, and link adjustments to all preview items.
- **Row-Level Propagation**: Added a quick "Copy metadata to all other pins" row action link to propagate custom card values across the grid.

### Optimized
- **Prompt-Only Mode (Image Loading Bypass)**: Configured the backend AI processor to skip physical file parsing, resizing, scaling, and base64 conversions when an image prompt is present, directly using the prompt text as the visual source of truth for Kimi 2.6.
- **Parallel Vision & SEO Concurrency**: Refactored the bulk AI generator to process up to 10 image-prompt SEO metadata queries in parallel instead of sequentially.
- **API Request Retries**: Integrated automatic fallback retries (up to 3 times) for failed image-prompt analysis calls before applying safe static backups.
- **Tailored Pinterest SEO Prompt**: Prompted Kimi to frontload board/search terms in the first 30 characters of the Title, place primary keywords in the first sentence of the Description, and restrict hashtags to 0-2 for maximum Pinterest indexing compliance.

## [1.0.4] - 2026-07-06
### Fixed — Full SEO Pipeline Audit (5 Gaps)
- **GAP-1 🔴**: `generateSEOComplete` (used by "Generate All" button) now instructs AI to write 400-500 character descriptions instead of the old 150-250 char limit. All buttons now produce rich, long descriptions consistently.
- **GAP-2 🔴**: `analyzeImage` (used by "Analyze Image" vision button) prompt updated from 150-250 chars to 400-500 chars so image analysis also produces long, SEO-rich descriptions.
- **GAP-3 🟡**: If user hasn't selected a board yet when clicking "Analyze Image", the AI now falls back to the Topic/Keyword field as board context instead of sending an empty string. The AI always has niche context.
- **GAP-4 🟡**: `destinationUrl` is now forwarded all the way through to `analyzeImage` (CreatePin → IPC → main.ts → openCodeProvider). The AI can now reference the destination link in the description.
- **GAP-5 🟢**: Fallback strings (shown when AI API fails) completely rewritten — now include board name, rich multi-sentence text at 400+ chars, and proper niche-specific hashtags instead of generic 1-line placeholders.

## [1.0.3] - 2026-07-06
### Fixed
- **Tab Switch State Loss**: Switching to another screen (Accounts, Queue, etc.) and coming back to Create Pin no longer wipes out uploaded images, AI results, or any data that was in progress. Previously the entire Create Pin component was destroyed and recreated every time you changed tabs. It is now kept alive in memory (hidden via CSS) so all state is perfectly preserved until you manually clear the form or submit.

## [1.0.2] - 2026-07-06
### Fixed
- **Copy Pin Button**: Rewrote the copy to clipboard logic to use Electron's native `clipboard:write` IPC handler. This bypasses web browser security restrictions that were blocking the "Copy" buttons in the Queue and Logs pages from working.
- **AI Title Numbers**: Updated the bulk-import filename parser to automatically strip trailing numbers and long timestamps (like `20260630`) from filenames. Images like `Woman_Hair_2024.jpg` will now just result in the clean AI topic `Woman Hair`.

### Changed
- **AI Description Length**: Re-prompted the AI models to write much longer descriptions (400-500 characters, 2-3 paragraphs) instead of short ones, maximizing Pinterest SEO visibility and engagement.

## [1.0.0] - 2026-07-06
### Added
- Initial stable release of Pinterest Pin Publisher.
- Core UI (Dashboard, Accounts, Boards, Create Pin, Queue, Drafts, Logs, Settings).
- SQLite and JSON fallback database drivers with full CRUD operations.
- Playwright-based Pinterest publisher with headless and visible modes.
- Anti-bot fingerprint management for browser sessions.
- OpenCode API integration for SEO generation (Title, Description, Alt Text, Tags).
- Scheduled pin publishing with variable pacing (pin/account delays).

### Fixed
- Fixed 25 critical and medium bugs identified during extensive UAT, including comprehensive database schema mapping for JSON fallback driver, IPC wiring for scheduling data, and Chromium session persistence issues.
