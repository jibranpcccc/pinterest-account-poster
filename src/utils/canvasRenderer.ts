/**
 * HTML5 Canvas Banner & Typography Overlay Engine
 * 
 * Bakes high-converting typography banners and badges directly onto
 * Pinterest pin images at full resolution with crisp font rendering,
 * rounded containers, and modern visual presets.
 */

export interface BannerOverlayOptions {
  text: string;
  position: 'top' | 'center' | 'bottom';
  preset: 'modern' | 'badge' | 'gradient' | 'neon' | 'glass' | 'pill' | 'bold';
  bgColor?: string;
  textColor?: string;
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  fontFamily?: 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';
  opacity?: number;
}

/**
 * Renders the chosen text overlay onto an image using an off-screen HTML5 Canvas
 * and returns the composite image as a high-quality JPEG Base64 Data URL.
 */
export async function renderBannerOverlayToCanvas(
  imageSrc: string,
  options: BannerOverlayOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return resolve(imageSrc);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width || 1000;
        const height = img.naturalHeight || img.height || 1500;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(imageSrc);
        }

        // 1. Draw source image at full native resolution
        ctx.drawImage(img, 0, 0, width, height);

        const text = options.text.trim();
        if (!text) {
          return resolve(canvas.toDataURL('image/jpeg', 0.95));
        }

        // 2. Compute proportional font size and family
        const fontSizeScale: Record<string, number> = {
          sm: 0.036,
          md: 0.048,
          lg: 0.062,
          xl: 0.078
        };
        const fontScale = fontSizeScale[options.fontSize || 'md'] || 0.048;
        const fontSizePx = Math.round(width * fontScale);

        const fontFamilies: Record<string, string> = {
          sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          serif: '"Playfair Display", Georgia, "Times New Roman", serif',
          mono: '"JetBrains Mono", "Courier New", monospace',
          display: 'Impact, "Arial Black", sans-serif',
          handwriting: 'Caveat, "Brush Script MT", cursive'
        };
        const selectedFont = fontFamilies[options.fontFamily || 'sans'] || fontFamilies.sans;
        const fontWeight = options.preset === 'bold' || options.preset === 'badge' ? '900' : '800';

        ctx.font = `${fontWeight} ${fontSizePx}px ${selectedFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 3. Word wrap text to fit within 84% of canvas width
        const maxTextWidth = width * 0.84;
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = ctx.measureText(testLine).width;
          if (testWidth <= maxTextWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        // 4. Calculate banner container dimensions
        const lineHeight = fontSizePx * 1.35;
        const textBlockHeight = lines.length * lineHeight;
        const padX = Math.round(fontSizePx * 1.2);
        const padY = Math.round(fontSizePx * 0.9);

        let longestLineWidth = 0;
        for (const l of lines) {
          const w = ctx.measureText(l).width;
          if (w > longestLineWidth) longestLineWidth = w;
        }

        const boxWidth = Math.min(width * 0.92, longestLineWidth + padX * 2);
        const boxHeight = textBlockHeight + padY * 2;
        const boxX = (width - boxWidth) / 2;

        let boxY = 0;
        if (options.position === 'top') {
          boxY = Math.round(height * 0.07);
        } else if (options.position === 'bottom') {
          boxY = Math.round(height * 0.93 - boxHeight);
        } else {
          boxY = Math.round((height - boxHeight) / 2);
        }

        // 5. Draw rounded background container
        ctx.save();
        const globalAlpha = (options.opacity ?? 100) / 100;
        ctx.globalAlpha = Math.max(0.2, Math.min(1.0, globalAlpha));

        const borderRadius = options.preset === 'badge' || options.preset === 'pill'
          ? Math.min(boxHeight / 2, 40)
          : Math.min(24, Math.round(fontSizePx * 0.5));

        // Helper: Rounded Rectangle Path
        const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        };

        // Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = Math.round(fontSizePx * 0.6);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.round(fontSizePx * 0.2);

        // Fill style based on preset
        switch (options.preset) {
          case 'badge':
            ctx.fillStyle = options.bgColor || '#e11d48';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(2, Math.round(fontSizePx * 0.08));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.stroke();
            break;

          case 'gradient': {
            const grad = ctx.createLinearGradient(boxX, boxY, boxX + boxWidth, boxY + boxHeight);
            grad.addColorStop(0, '#e11d48');
            grad.addColorStop(0.5, '#db2777');
            grad.addColorStop(1, '#7c3aed');
            ctx.fillStyle = grad;
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(2, Math.round(fontSizePx * 0.08));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.stroke();
            break;
          }

          case 'neon':
            ctx.fillStyle = 'rgba(10, 10, 10, 0.92)';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'rgba(251, 191, 36, 0.7)';
            ctx.shadowBlur = Math.round(fontSizePx * 0.8);
            ctx.lineWidth = Math.max(3, Math.round(fontSizePx * 0.1));
            ctx.strokeStyle = '#fbbf24';
            ctx.stroke();
            break;

          case 'glass':
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(2, Math.round(fontSizePx * 0.08));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.stroke();
            break;

          case 'pill':
            ctx.fillStyle = options.bgColor || 'rgba(76, 29, 149, 0.92)';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(2, Math.round(fontSizePx * 0.08));
            ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
            ctx.stroke();
            break;

          case 'bold':
            ctx.fillStyle = options.bgColor || '#dc2626';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(3, Math.round(fontSizePx * 0.12));
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            break;

          case 'modern':
          default:
            ctx.fillStyle = options.bgColor || 'rgba(15, 23, 42, 0.92)';
            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(1.5, Math.round(fontSizePx * 0.06));
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
            ctx.stroke();
            break;
        }

        ctx.restore();

        // 6. Draw typography text lines
        ctx.save();
        ctx.font = `${fontWeight} ${fontSizePx}px ${selectedFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let textColor = options.textColor || '#ffffff';
        if (options.preset === 'neon' && !options.textColor) textColor = '#fbbf24';
        if (options.preset === 'glass' && !options.textColor) textColor = '#0f172a';

        ctx.fillStyle = textColor;
        ctx.shadowColor = options.preset === 'glass' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = Math.round(fontSizePx * 0.3);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.round(fontSizePx * 0.1);

        const startY = boxY + padY + lineHeight / 2;
        const centerX = width / 2;

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], centerX, startY + i * lineHeight);
        }
        ctx.restore();

        // 7. Export high-quality JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        resolve(dataUrl);
      } catch (err) {
        console.error('Failed to bake banner onto canvas:', err);
        resolve(imageSrc);
      }
    };

    img.onerror = (err) => {
      console.warn('Image failed to load in canvas renderer, returning original path:', err);
      resolve(imageSrc);
    };

    // Format local media protocol or standard src
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://') || imageSrc.startsWith('data:')) {
      img.src = imageSrc;
    } else {
      img.src = `media:///${imageSrc.replace(/\\/g, '/')}`;
    }
  });
}
