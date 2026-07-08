# Pinterest Account Poster - Project Rules & Learnings

## Core Architecture
- **Tech Stack**: Electron + React (Vite) + Playwright + SQLite.
- **Publishing Engine**: Handled in `electron/publisher/publishExecutor.ts`. Do not modify React UI components for backend processing (like image manipulation).

## Stability Rules
- **Playwright Configuration (Windows)**: When launching Chromium via Playwright in the packaged Electron `.exe` on Windows, you **MUST** include `--no-sandbox` and `--disable-gpu` in the launch arguments. Otherwise, the Chromium process will crash silently. Additionally, `headless` must be set to `false`.
- **Image Processing**: The project uses `jimp` (v0.22.12) for image manipulation (specifically the AI Image Footprint Remover). Native image modules (like Python or `sharp`) should be avoided because they cause compilation/portability issues when packaged into the standalone `.exe` using `electron-builder`.

## GitHub Actions & Deployment
- `npm run package:ci` is used to build the production `.exe` and upload it to GitHub Releases.
- **Draft Releases**: `electron-builder` publishes to GitHub Releases as a **Draft** by default. To make it publicly visible for the user, it must be manually published via `gh release edit <tag> --draft=false`.

## Features: AI Footprint Remover (Implemented in v1.0.15)
- **Library**: `jimp@0.22.12` is specifically locked in `package.json`. Do not upgrade to Jimp v1.x as it breaks the buffer manipulation required for the scrambler logic.
- **Logic File**: The 6-layer destruction algorithm (Strip metadata, Invisible Edge Crop, Micro-Resize Warp, Latent Noise Blur, Multi-Spectrum Jitter, and Natural Compression) is entirely contained within `electron/publisher/aiImageCleaner.ts`.
- **Pipeline Intercept**: Integrated directly into `electron/publisher/publishExecutor.ts`. It intercepts `job.imagePath`, generates a temporary `_clean_...` image, uploads the clean image to Pinterest, and finally deletes the temp file in the `finally` block to prevent disk clutter.
