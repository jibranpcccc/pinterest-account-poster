# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
