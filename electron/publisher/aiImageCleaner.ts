import Jimp from 'jimp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Scrubs AI fingerprints from an image using a 6-layer protocol:
 * 1. Metadata scrub (via re-encoding to raw pixels)
 * 2. Invisible edge crop
 * 3. Micro-resize warp
 * 4. Latent noise destruction (blur)
 * 5. Multi-spectrum jitter (brightness/contrast)
 * 6. Natural compression (JPEG Q=92)
 * 
 * @param imagePath Path to the original image
 * @param watermarkText Optional text to watermark onto the image
 * @returns Path to the newly created cleaned image
 */
export async function scrubAiFootprint(imagePath: string, watermarkText?: string): Promise<string> {
    try {
        console.log(`[AI Scrubber] Starting cleaning process for ${imagePath}`);
        
        // 1. Read image (automatically strips EXIF/XMP when converting to raw Jimp buffer)
        const image = await Jimp.read(imagePath);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        // 2. Invisible edge crop (2 pixels from each side to remove invisible borders/steganography)
        // If image is too small, skip crop
        if (originalWidth > 20 && originalHeight > 20) {
            image.crop(2, 2, originalWidth - 4, originalHeight - 4);
        }

        const w = image.getWidth();
        const h = image.getHeight();

        // 3. Micro-resize warp (up and down)
        // This breaks fixed grid hashes and structural noise patterns
        image.resize(w + 3, h + 3, Jimp.RESIZE_BICUBIC);
        image.resize(w, h, Jimp.RESIZE_BICUBIC);

        // 4. Latent noise destruction
        image.blur(1);

        // 5. Multi-spectrum Jitter
        // Brightness takes a number from -1 to +1
        const b = (Math.random() * 0.04) - 0.02; // -0.02 to +0.02
        image.brightness(b);

        // Contrast takes a number from -1 to +1
        const c = (Math.random() * 0.06) - 0.03; // -0.03 to +0.03
        image.contrast(c);

        // Optional: Watermark
        if (watermarkText) {
            try {
                // Using built in font from Jimp
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                
                // Calculate position for bottom right corner with some padding
                const textWidth = Jimp.measureText(font, watermarkText);
                const textHeight = Jimp.measureTextHeight(font, watermarkText, image.getWidth());
                
                const padding = 20;
                const x = image.getWidth() - textWidth - padding;
                const y = image.getHeight() - textHeight - padding;
                
                // Print watermark (if image is large enough)
                if (x > 0 && y > 0) {
                    image.print(font, x, y, watermarkText);
                }
            } catch (fontErr) {
                console.warn('[AI Scrubber] Failed to apply watermark font', fontErr);
            }
        }

        // 6. Natural Compression
        // Save as JPEG with Quality 92
        const tmpDir = os.tmpdir();
        const randStr = Math.random().toString(36).substring(2, 8);
        const outName = `clean_${randStr}_${path.basename(imagePath, path.extname(imagePath))}.jpg`;
        const outPath = path.join(tmpDir, outName);

        await image.quality(92).writeAsync(outPath);
        
        console.log(`[AI Scrubber] Successfully cleaned image to ${outPath}`);
        return outPath;
    } catch (err) {
        console.error(`[AI Scrubber] Failed to clean ${imagePath}, falling back to original:`, err);
        return imagePath;
    }
}
