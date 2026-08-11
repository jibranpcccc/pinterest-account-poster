import Jimp from 'jimp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface ScramblerOptions {
    watermarkText?: string;
    bannerOverlay?: {
        enabled: boolean;
        text: string;
        position?: 'top' | 'center' | 'bottom';
        preset?: 'modern' | 'badge' | 'gradient' | 'neon' | 'glass' | 'pill' | 'bold';
        textColor?: string;
        fontSize?: 'sm' | 'md' | 'lg' | 'xl';
    };
    scrambleFootprint?: boolean;
}

/**
 * Scrubs AI fingerprints from an image using a 6-layer protocol and/or applies text banner overlays & watermarks:
 * 1. Metadata scrub (via re-encoding to raw pixels)
 * 2. Invisible edge crop
 * 3. Micro-resize warp
 * 4. Latent noise destruction (blur)
 * 5. Multi-spectrum jitter (brightness/contrast)
 * 6. AI Banner Overlay / Watermark printing
 * 7. Natural compression (JPEG Q=92)
 * 
 * @param imagePath Path to the original image
 * @param watermarkText Optional text to watermark onto the image
 * @param options Scrambler and overlay options
 * @returns Path to the newly created cleaned/processed image
 */
export async function scrubAiFootprint(
    imagePath: string, 
    watermarkText?: string,
    options?: ScramblerOptions
): Promise<string> {
    try {
        console.log(`[AI Scrubber] Starting cleaning/watermarking process for ${imagePath}`);
        
        // 1. Read image (automatically strips EXIF/XMP when converting to raw Jimp buffer)
        const image = await Jimp.read(imagePath);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        const shouldScramble = options?.scrambleFootprint !== false;

        if (shouldScramble) {
            // 2. Invisible edge crop (2 pixels from each side to remove invisible borders/steganography)
            if (originalWidth > 20 && originalHeight > 20) {
                image.crop(2, 2, originalWidth - 4, originalHeight - 4);
            }

            const w = image.getWidth();
            const h = image.getHeight();

            // 3. Micro-resize warp (up and down)
            image.resize(w + 3, h + 3, Jimp.RESIZE_BICUBIC);
            image.resize(w, h, Jimp.RESIZE_BICUBIC);

            // 4. Latent noise destruction
            image.blur(1);

            // 5. Multi-spectrum Jitter
            const b = (Math.random() * 0.04) - 0.02; // -0.02 to +0.02
            image.brightness(b);

            const c = (Math.random() * 0.06) - 0.03; // -0.03 to +0.03
            image.contrast(c);
        }

        // Apply Banner Overlay if specified
        const bannerText = options?.bannerOverlay?.enabled ? options.bannerOverlay.text : undefined;
        if (bannerText && bannerText.trim()) {
            try {
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                const textWidth = Jimp.measureText(font, bannerText);
                const textHeight = Jimp.measureTextHeight(font, bannerText, image.getWidth() - 40);

                const bannerHeight = Math.max(70, textHeight + 30);
                const position = options?.bannerOverlay?.position || 'top';
                
                let bannerY = 30;
                if (position === 'center') {
                    bannerY = Math.floor((image.getHeight() - bannerHeight) / 2);
                } else if (position === 'bottom') {
                    bannerY = image.getHeight() - bannerHeight - 30;
                }

                // Draw semi-transparent background banner rectangle
                const bannerBg = new Jimp(image.getWidth(), bannerHeight, 0x020617ee);
                image.composite(bannerBg, 0, bannerY);

                // Print centered text over banner
                const textX = Math.max(10, Math.floor((image.getWidth() - textWidth) / 2));
                const textY = bannerY + Math.floor((bannerHeight - textHeight) / 2);
                image.print(font, textX, textY, bannerText);
            } catch (bannerErr) {
                console.warn('[AI Scrubber] Failed to render banner overlay:', bannerErr);
            }
        }

        // Optional: Watermark
        const effectiveWatermark = watermarkText || options?.watermarkText;
        if (effectiveWatermark && effectiveWatermark.trim()) {
            try {
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                const textWidth = Jimp.measureText(font, effectiveWatermark);
                const textHeight = Jimp.measureTextHeight(font, effectiveWatermark, image.getWidth());
                
                const padding = 20;
                const x = image.getWidth() - textWidth - padding;
                const y = image.getHeight() - textHeight - padding;
                
                if (x > 0 && y > 0) {
                    image.print(font, x, y, effectiveWatermark);
                }
            } catch (fontErr) {
                console.warn('[AI Scrubber] Failed to apply watermark font', fontErr);
            }
        }

        // 6. Natural Compression (Save as JPEG with Quality 92)
        const tmpDir = os.tmpdir();
        const randStr = Math.random().toString(36).substring(2, 8);
        const outName = `clean_${randStr}_${path.basename(imagePath, path.extname(imagePath))}.jpg`;
        const outPath = path.join(tmpDir, outName);

        await image.quality(92).writeAsync(outPath);
        
        console.log(`[AI Scrubber] Successfully processed image to ${outPath}`);
        return outPath;
    } catch (err) {
        console.error(`[AI Scrubber] Failed to clean ${imagePath}, falling back to original:`, err);
        return imagePath;
    }
}

/**
 * Batch scrubs/watermarks an array of images in parallel pool.
 */
export async function batchScrubImages(
    items: { 
        id?: string; 
        imagePath: string; 
        watermarkText?: string; 
        bannerText?: string; 
        bannerPosition?: 'top' | 'center' | 'bottom';
    }[],
    options: {
        scrambleFootprint?: boolean;
        applyWatermark?: boolean;
        applyBanner?: boolean;
        defaultWatermark?: string;
        defaultBannerPosition?: 'top' | 'center' | 'bottom';
    },
    onProgress?: (current: number, total: number, message: string) => void
): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    const total = items.length;

    const concurrency = 5;
    for (let i = 0; i < total; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        await Promise.all(
            chunk.map(async (item, chunkIdx) => {
                const itemIdx = i + chunkIdx;
                if (onProgress) {
                    onProgress(itemIdx + 1, total, `Processing image ${itemIdx + 1} of ${total}: ${path.basename(item.imagePath)}...`);
                }
                const wmText = options.applyWatermark ? (item.watermarkText || options.defaultWatermark) : undefined;
                const bannerTxt = options.applyBanner ? item.bannerText : undefined;
                const bannerPos = item.bannerPosition || options.defaultBannerPosition || 'top';

                const newPath = await scrubAiFootprint(item.imagePath, wmText, {
                    scrambleFootprint: options.scrambleFootprint !== false,
                    watermarkText: wmText,
                    bannerOverlay: bannerTxt ? {
                        enabled: true,
                        text: bannerTxt,
                        position: bannerPos
                    } : undefined
                });

                results[item.imagePath] = newPath;
            })
        );
    }

    return results;
}

