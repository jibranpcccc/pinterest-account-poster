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
    id: 'listicle',
    name: '📌 Viral Listicle',
    title: '{Top 10|Best 15|20+ Must-Try} {filename} Ideas for {year}',
    description: '{Check out|Discover|Explore} these {stunning|amazing|creative} {filename} ideas! {Whether you need|If you want} {inspiration|fresh concepts|tips}, save this pin to your {board} board. Click to read the full guide!'
  },
  {
    id: 'howto',
    name: '💡 How-To & Tutorial',
    title: '{How to|Step-by-Step Guide to|Easy Ways to} {filename} ({year} Edition)',
    description: 'Looking for {easy|simple|effective} ways to master {filename}? {Here is our ultimate|Read this quick|Check out this step-by-step} breakdown. Pin #{index} of our {total}-part series! Save to {board}.'
  },
  {
    id: 'aesthetic',
    name: '✨ Aesthetic & Outfit/Decor',
    title: '{Aesthetic|Trendy|Modern|Cozy} {filename} Inspiration',
    description: '{Get inspired by|Feast your eyes on|Love} this {gorgeous|stylish|vibey} {filename} setup. Perfect for your {board} collection. Click link for details! #{filename_raw}'
  },
  {
    id: 'seo_heavy',
    name: '⚡ High-CTR SEO Generator',
    title: '{filename} - {Ultimate|Best|Trending} {board} Ideas #{index}',
    description: '{filename} tips and inspiration for {year}. Discover {top-rated|viral|must-have} {board} trends that work. Bookmark this pin now!'
  }
];
