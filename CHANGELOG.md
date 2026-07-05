# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
