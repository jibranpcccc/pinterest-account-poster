/**
 * Spintax & Dynamic Template Generator Utility
 * 
 * Supports nested spintax syntax: {option1|option2|{nested1|nested2}}
 * Supports placeholders: {filename}, {filename_raw}, {index}, {total}, {board}, {url}, {topic}, {date}, {year}, {rand}
 */

export interface SpintaxItemContext {
  filename?: string;
  filenameRaw?: string;
  index?: number;
  total?: number;
  board?: string;
  url?: string;
  topic?: string;
  date?: string;
  year?: string;
}

/**
 * Formats raw filenames into human-readable titles/topics
 * e.g., "fashion_trends_2026_001.png" -> "Fashion Trends"
 */
export function formatFilenameToCleanTitle(filename: string): string {
  if (!filename) return '';
  const cleaned = filename
    .replace(/\.[^/.]+$/, "") // strip extension
    .replace(/[-_]/g, " ")     // replace dashes/underscores
    .replace(/\b\d{4,}\b/g, "") // strip timestamp/year codes
    .replace(/\s*\b\d+\b\s*$/, "") // strip trailing index numbers
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim();
  
  if (!cleaned) return filename.replace(/\.[^/.]+$/, "");
  return cleaned.replace(/\b\w/g, c => c.toUpperCase()); // Capitalize Words
}

/**
 * Recursively parses spintax format {A|B|C}
 * Seed can be passed for deterministic pseudo-random choices per item
 */
export function spinText(text: string, seed?: number | string): string {
  if (!text) return '';

  let result = text;
  // Match innermost spintax braces: {choice1|choice2|choice3} without containing sub-braces
  const regex = /\{([^{}]+)\}/g;

  let iterations = 0;
  const maxIterations = 20; // prevent infinite loops

  // Convert seed to integer if provided
  let seedNum = typeof seed === 'number' 
    ? seed 
    : typeof seed === 'string' 
      ? seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      : 0;

  function getRandomChoice(options: string[], callIndex: number): string {
    if (options.length === 0) return '';
    let randIndex: number;
    if (seed !== undefined && seed !== null) {
      // Linear congruential generator step for pseudo-randomness based on seed
      const pseudoRand = Math.abs(Math.sin(seedNum + callIndex * 997 + 13)) * 10000;
      randIndex = Math.floor(pseudoRand) % options.length;
    } else {
      randIndex = Math.floor(Math.random() * options.length);
    }
    return options[randIndex];
  }

  let callCounter = 0;
  while (regex.test(result) && iterations < maxIterations) {
    callCounter++;
    result = result.replace(regex, (_, choicesStr) => {
      const choices = choicesStr.split('|');
      return getRandomChoice(choices, callCounter);
    });
    // Reset regex index for safety
    regex.lastIndex = 0;
    iterations++;
  }

  return result;
}

/**
 * Calculates the total number of unique combinations for a spintax string
 */
export function calculateSpintaxVariations(template: string): number {
  if (!template) return 1;

  let totalVariations = 1;
  const regex = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;

  let workingText = template;
  let iterations = 0;

  while ((match = regex.exec(workingText)) !== null && iterations < 15) {
    const choices = match[1].split('|');
    if (choices.length > 1) {
      totalVariations *= choices.length;
    }
    workingText = workingText.replace(match[0], 'X');
    regex.lastIndex = 0;
    iterations++;
  }

  return Math.max(1, totalVariations);
}

/**
 * Full dynamic template processing combining placeholders and spintax
 */
export function processDynamicTemplate(
  template: string,
  context: SpintaxItemContext,
  itemSeed?: number | string
): string {
  if (!template) return '';

  const cleanFile = formatFilenameToCleanTitle(context.filename || '');
  const rawFile = (context.filename || '').replace(/\.[^/.]+$/, "");
  const idxStr = String(context.index || 1);
  const totalStr = String(context.total || 1);
  const boardStr = context.board || 'Pinterest Board';
  const topicStr = context.topic || cleanFile || 'Ideas';
  const urlStr = context.url || '';
  const now = new Date();
  const dateStr = context.date || now.toISOString().split('T')[0];
  const yearStr = context.year || String(now.getFullYear());

  // Generate pseudo-random number based on item index if available
  const randVal = itemSeed !== undefined
    ? Math.floor(100 + (Math.abs(Math.sin(Number(itemSeed) * 451)) * 900))
    : Math.floor(100 + Math.random() * 900);
  const randNumStr = String(randVal);

  // Step 1: Replace placeholders (case-insensitive)
  let processed = template
    .replace(/\{filename\}/gi, cleanFile)
    .replace(/\{filename_raw\}/gi, rawFile)
    .replace(/\{index\}/gi, idxStr)
    .replace(/\{total\}/gi, totalStr)
    .replace(/\{board\}/gi, boardStr)
    .replace(/\{topic\}/gi, topicStr)
    .replace(/\{keyword\}/gi, topicStr)
    .replace(/\{url\}/gi, urlStr)
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{year\}/gi, yearStr)
    .replace(/\{rand\}/gi, randNumStr)
    .replace(/\{random_num\}/gi, randNumStr);

  // Step 2: Spin Spintax
  return spinText(processed, itemSeed);
}

export const SPINTAX_PRESETS = [
  {
    id: 'clean_guide',
    name: '🎯 High-Intent Search Guide',
    title: '{filename} Guide: {Top|Best|Essential} {board} Ideas for {year}',
    description: '{filename} provides practical inspiration and clean styling for your {board} collection. This look focuses on natural texture and balanced proportions for everyday wear. Save this pin for your next style update.'
  },
  {
    id: 'tutorial_breakdown',
    name: '📐 Step-by-Step Styling & Inspiration',
    title: 'How to Style {filename}: {Step-by-Step|Complete|Easy} Guide',
    description: 'Learn how to style {filename} with simple techniques that maintain shape and volume. This method works well across different settings and requires minimal daily maintenance. Pin this look for your next appointment.'
  },
  {
    id: 'aesthetic_curation',
    name: '🌿 Minimalist & Aesthetic Curation',
    title: '{filename} Inspiration for {year} {board} Trends',
    description: '{filename} showcases a refined and balanced look with textured details and soft tones. Designed to complement modern {board} aesthetics with clean lines. Save this pin to your inspiration board.'
  },
  {
    id: 'deep_seo',
    name: '⚡ Front-Loaded Search Authority',
    title: '{filename} Ideas: {Modern|Timeless|Classic} {board} Concepts',
    description: '{filename} highlights versatile elements tailored for {board} enthusiasts. The styling emphasizes clean contours and lasting dimension without unnecessary complexity. Reference this before your next consultation.'
  }
];
