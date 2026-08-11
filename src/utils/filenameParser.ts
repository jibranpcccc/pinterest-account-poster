/**
 * Filename Parser Utility
 * Extracts clean titles, sequence indexes, dates, and keyword tags from raw filenames.
 */

export interface ParsedFilename {
  raw: string;
  cleanName: string;
  title: string;
  extension: string;
  index: number | null;
  date: string | null;
  tags: string[];
}

/**
 * Converts a raw filename into a human-readable clean title.
 * e.g., "2026-08-15_001_modern_kitchen_decor_idea.png" -> "Modern Kitchen Decor Idea"
 */
export function cleanFilenameToTitle(filename: string): string {
  if (!filename) return '';
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const cleaned = baseName
    .replace(/^(?:20\d{2})[-_/.](?:0[1-9]|1[0-2])[-_/.](?:0[1-9]|[12]\d|3[01])[-_]?/, '') // remove ISO date prefix
    .replace(/^[\d_-]+/, '')                           // remove leading digits/dashes
    .replace(/[-_]/g, ' ')                             // replace dashes/underscores with spaces
    .replace(/\b\d{4,}\b/g, '')                        // strip 4+ digit standalone numbers
    .replace(/\s*\b\d+\b\s*$/, '')                     // strip trailing sequence index
    .replace(/\s+/g, ' ')                              // collapse multiple spaces
    .trim();

  if (!cleaned) return baseName.replace(/[-_]/g, ' ').trim();

  return cleaned
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extracts sequence index from filename if present (e.g. "image_005.jpg" -> 5)
 */
export function extractSequenceIndex(filename: string): number | null {
  if (!filename) return null;
  const baseName = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/^(?:20\d{2})[-_/.](?:0[1-9]|1[0-2])[-_/.](?:0[1-9]|[12]\d|3[01])[-_]?/, '');
  const match = baseName.match(/(?:^|[-_#\s])(\d{1,4})(?:$|[-_#\s])/);
  if (match) {
    const val = parseInt(match[1], 10);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Extracts ISO date string (YYYY-MM-DD) from filename if present.
 */
export function extractDateFromFilename(filename: string): string | null {
  if (!filename) return null;
  const match = filename.match(/(20\d{2})[-_/.]?(0[1-9]|1[0-2])[-_/.]?(0[1-9]|[12]\d|3[01])/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

/**
 * Extracts keyword tags from filename (words with 3+ letters, excluding dates/numbers).
 */
export function extractKeywords(filename: string): string[] {
  if (!filename) return [];
  const title = cleanFilenameToTitle(filename);
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && isNaN(Number(w)));

  return Array.from(new Set(words));
}

/**
 * Parses all metadata from a filename into a structured ParsedFilename object.
 */
export function parseFilename(filename: string): ParsedFilename {
  if (!filename) {
    return {
      raw: '',
      cleanName: '',
      title: '',
      extension: '',
      index: null,
      date: null,
      tags: [],
    };
  }

  const extensionMatch = filename.match(/\.([^/.]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
  const baseName = filename.replace(/\.[^/.]+$/, '');

  return {
    raw: filename,
    cleanName: baseName,
    title: cleanFilenameToTitle(filename),
    extension,
    index: extractSequenceIndex(filename),
    date: extractDateFromFilename(filename),
    tags: extractKeywords(filename),
  };
}
