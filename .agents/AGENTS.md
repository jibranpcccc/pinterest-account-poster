# Pinterest Account Poster - Project Rules & Learnings

## Core Architecture
- **Tech Stack**: Electron + React (Vite) + Playwright + SQLite.
- **Publishing Engine**: Handled in `electron/publisher/publishExecutor.ts`. Do not modify React UI components for backend processing (like image manipulation).

## Stability Rules
- **Playwright Configuration (Windows)**: When launching Chromium via Playwright in the packaged Electron `.exe` on Windows, you **MUST** include `--no-sandbox` and `--disable-gpu` in the launch arguments. Otherwise, the Chromium process will crash silently. Additionally, `headless` must be set to `false`.
- **Image Processing**: The project uses `jimp` (v0.22.12) for image manipulation (specifically the AI Image Footprint Remover). Native image modules (like Python or `sharp`) should be avoided because they cause compilation/portability issues when packaged into the standalone `.exe` using `electron-builder`.

## GitHub Actions & Deployment
- **Packaging**: `npm run package:ci` is used to build the production `.exe` and upload it to GitHub Releases.
- **Draft Releases**: `electron-builder` publishes to GitHub Releases as a **Draft** by default. To make it publicly visible for the user, it must be manually published via `gh release edit <tag> --draft=false`.
- **Push Protection**: Never commit or push API keys or sensitive testing scripts (e.g. `scratch/` or `testing/`) to GitHub. If secret scanning blocks a push, you must completely remove the files from Git history (e.g. `git rm -rf --cached`, commit, and `git push -f`) rather than just adding them to `.gitignore`.

## Features: AI Footprint Remover
- **Library**: `jimp@0.22.12` is specifically locked in `package.json`. Do not upgrade to Jimp v1.x as it breaks the buffer manipulation required for the scrambler logic.
- **Logic File**: The 6-layer destruction algorithm (Strip metadata, Invisible Edge Crop, Micro-Resize Warp, Latent Noise Blur, Multi-Spectrum Jitter, and Natural Compression) is entirely contained within `electron/publisher/aiImageCleaner.ts`.
- **Pipeline Intercept**: Integrated directly into `electron/publisher/publishExecutor.ts`. It intercepts `job.imagePath`, generates a temporary `_clean_...` image, uploads the clean image to Pinterest, and finally deletes the temp file in the `finally` block to prevent disk clutter.

## Features: AI Auto-Repin & Destination URLs
- **Destination URLs**: Pinterest changed their UI, so the destination URL field must be filled by checking for both `input[placeholder*='Link']` and `textarea[placeholder*='Link']` locators. This logic is stable in `v1.0.21`.
- **AI Auto-Repin**: Multi-board auto-repinning is supported by passing a comma-separated list of boards. If the AI toggle is checked, `[AI_AUTO_GENERATE]` is passed to `repinExecutor.ts`, which uses `OpenCodeProvider` to query the Cloudflare AI worker to generate Pinterest-optimized search keywords dynamically based on the board name.
