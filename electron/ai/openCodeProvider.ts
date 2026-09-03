import { DbManager } from '../database/db';
import * as fs from 'fs';
import * as path from 'path';
import { nativeImage, app } from 'electron';

export interface AIInput {
  topic?: string;
  keyword?: string;
  title?: string;
  description?: string;
  imageNotes?: string;
  tone?: string;
  audience?: string;
  boardName?: string;
  destinationUrl?: string;
}


const PINTEREST_RULES = {
  titleMin: 35,
  titleMax: 85,
  descriptionMin: 120,
  descriptionMax: 380,
  altMinWords: 6,
  altMaxWords: 22,
  allowEmoji: false,
  allowHashtags: false,
  allowPipe: false,
  bannedWords: [
    'stunning',
    'amazing',
    'perfect',
    'viral',
    'trending',
    'obsession',
    'must-have',
    'hair goals'
  ],
  bannedDescriptionOpeners: [
    'discover',
    'achieve',
    'check out',
    'looking for',
    'get inspired'
  ]
};

function wordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function hasCompleteSentence(text: string): boolean {
  return /[.!?]$/.test((text || '').trim());
}

function containsEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text || '');
}

function containsHashtag(text: string): boolean {
  return /(^|\s)#\w+/.test(text || '');
}

function containsPipe(text: string): boolean {
  return (text || '').includes('|');
}

function containsBannedWord(text: string): string | null {
  const lower = (text || '').toLowerCase();
  for (const w of PINTEREST_RULES.bannedWords) {
    if (lower.includes(w)) return w;
  }
  return null;
}

function startsWithBannedOpener(text: string): string | null {
  const lower = (text || '').trim().toLowerCase();
  for (const s of PINTEREST_RULES.bannedDescriptionOpeners) {
    if (lower.startsWith(s)) return s;
  }
  return null;
}

function normalizeBlackCapitalization(text: string): string {
  return (text || '')
    .replace(/\bblack women\b/g, 'Black women')
    .replace(/\bblack woman\b/g, 'Black woman')
    .replace(/\bblack men\b/g, 'Black men')
    .replace(/\bblack man\b/g, 'Black man')
    .replace(/\bblack hair\b/g, 'Black hair');
}

function safeTrimToSentence(text: string, max: number): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  if (lastSentence >= Math.floor(max * 0.6)) return cut.slice(0, lastSentence + 1).trim();
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

function normalizeFinalSEO(
  title: string,
  description: string,
  altText: string,
  visionJSON: any
): { title: string; description: string; altText: string; issues: string[] } {
  const t = cleanText(normalizeBlackCapitalization(title)).trim();
  const d = cleanText(normalizeBlackCapitalization(description)).trim();
  const a = cleanText(normalizeBlackCapitalization(altText)).trim();

  const issues = [
    validateTitle(t),
    validateDescription(d, visionJSON),
    validateAltText(a)
  ].filter(Boolean) as string[];

  return { title: t, description: d, altText: a, issues };
}

export interface AnalyzeImageResult {
  title: string;
  description: string;
  altText: string;
  shouldPost: boolean;
  mismatchWarning: string;
  source: 'stage2_ai' | 'fallback';
  suggestedBoardKeyword: string;
  boardFit: 'strong' | 'partial' | 'weak' | 'mismatch' | 'unknown';
  visionConfidence: number;
  visibleHairStyle: string;
  hairColor: string;
  hairTexture: string;
  hairLength: string;
  // Quality audit fields
  auditScore: number;       // 0–100
  auditIssues: string[];    // List of problems found
  auditRetried: boolean;    // Was a retry attempted?
}

// ══════════════════════════════════════════════════════════════
// SEO QUALITY AUDITOR
// Scores generated title/description 0-100 across 8 dimensions.
// If score < 70, the caller should retry with feedback.
// ══════════════════════════════════════════════════════════════
function auditSEOOutput(
  title: string,
  description: string,
  altText: string,
  boardName: string,
  imagePrompt: string
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  const tl = title.toLowerCase();
  const dl = description.toLowerCase();

  // ─ 1. Title Rules ─
  if (title.length < PINTEREST_RULES.titleMin) { issues.push(`Title too short (< ${PINTEREST_RULES.titleMin} chars)`); score -= 15; }
  if (title.length > PINTEREST_RULES.titleMax) { issues.push(`Title too long (> ${PINTEREST_RULES.titleMax} chars)`); score -= 10; }
  if (containsEmoji(title)) { issues.push('Title contains emoji'); score -= 20; }
  if (containsPipe(title)) { issues.push('Title contains pipe symbol'); score -= 20; }
  const bannedTitle = containsBannedWord(title);
  if (bannedTitle) { issues.push(`Title contains banned word: "${bannedTitle}"`); score -= 20; }

  // ─ 2. Description Rules ─
  if (description.length < PINTEREST_RULES.descriptionMin) { issues.push(`Description too short (< ${PINTEREST_RULES.descriptionMin} chars)`); score -= 15; }
  if (description.length > PINTEREST_RULES.descriptionMax) { issues.push(`Description too long (> ${PINTEREST_RULES.descriptionMax} chars)`); score -= 10; }
  if (containsEmoji(description)) { issues.push('Description contains emoji'); score -= 20; }
  if (containsHashtag(description)) { issues.push('Description contains hashtag'); score -= 20; }
  const bannedOpener = startsWithBannedOpener(description);
  if (bannedOpener) { issues.push(`Description starts with banned opener: "${bannedOpener}"`); score -= 15; }
  if (!hasCompleteSentence(description)) { issues.push('Description does not end with a complete sentence'); score -= 15; }

  // ─ 3. Alt Text Rules ─
  const wc = wordCount(altText);
  if (wc < PINTEREST_RULES.altMinWords) { issues.push(`Alt text too short (< ${PINTEREST_RULES.altMinWords} words)`); score -= 10; }
  if (wc > PINTEREST_RULES.altMaxWords) { issues.push(`Alt text too long (> ${PINTEREST_RULES.altMaxWords} words)`); score -= 10; }

  // ─ 4. Capitalization Check ─
  if (/\bblack women\b/.test(title) || /\bblack women\b/.test(description) || /\bblack women\b/.test(altText)) {
    issues.push('Lowercase "black women" used (should be "Black women")');
    score -= 10;
  }

  // ─ 5. Board keyword relevance ─
  const boardWords = boardName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const matchedBoardWords = boardWords.filter(w => tl.includes(w));
  if (boardWords.length > 0 && matchedBoardWords.length === 0) {
    issues.push(`Board keyword not reflected in title (board: "${boardName}")`); score -= 15;
  }

  // ─ 6. Prompt accuracy ─
  if (imagePrompt && imagePrompt.length > 10) {
    const promptKeywords = imagePrompt.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['photo', 'image', 'background', 'features', 'with', 'aesthetic'].includes(w));
    const matchedPromptWords = promptKeywords.filter(k => tl.includes(k) || dl.includes(k));
    if (promptKeywords.length > 0 && matchedPromptWords.length === 0) {
      issues.push('Output does not reflect key terms from the generation prompt'); score -= 20;
    }
  }

  return { score: Math.max(0, score), issues };
}

// ── In-memory Key Pool Cache (5 minute TTL) ──
let _keyPoolCache: { accountId: string; token: string }[] = [];
let _keyPoolCacheTime = 0;
const KEY_POOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — no need to re-read disk constantly
let _globalCfRoundRobinIndex = 0;

// ── Resolve project root robustly (works in dev & production builds) ──
// In production: __dirname = dist-electron/ → go up 1 level
// In dev:        __dirname = electron/ai/  → go up 2 levels
// process.cwd() = project root in both cases — most reliable

const getUserDataPath = () => {
  try {
    return app.getPath('userData');
  } catch {
    return path.join(process.cwd(), 'local-data');
  }
};

const _PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  if (require('fs').existsSync(path.join(cwd, 'cloudflare_accounts.txt'))) return cwd;
  return getUserDataPath();
})();

// ── Local status file — keeps track of exhausted (429) accounts ──
const LOCAL_CF_STATUS_PATH = path.join(getUserDataPath(), 'cloudflare_status.json');
// ── Local accounts file — copy of cloudflare_working_accounts.txt ──
const LOCAL_CF_ACCOUNTS_PATH = path.join(_PROJECT_ROOT, 'cloudflare_accounts.txt');

// ══════════════════════════════════════════════════════════════
// HAIR DETAIL HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

/** Strip generic AI noise from vision field values */
function cleanHairPhrase(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\bhair styling\b/g, '')
    .replace(/\bhairstyle\b/g, '')
    .replace(/\bhair hair\b/g, 'hair')
    .replace(/\bunclear\b/g, '')
    .replace(/\bnone\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a safe, specific visual hair detail string from vision JSON */
function buildVisualHairDetail(visionJSON: any): string {
  const color   = cleanHairPhrase(visionJSON?.hairColor || '');
  const texture = cleanHairPhrase(visionJSON?.hairTexture || '');
  const length  = cleanHairPhrase(visionJSON?.hairLength || '');
  const style   = cleanHairPhrase(visionJSON?.visibleHairStyle || '');

  const parts: string[] = [];
  if (length && length.length > 1)  parts.push(length);
  if (color  && color.length > 1)   parts.push(color);
  if (texture && texture.length > 1) parts.push(texture);

  let detail = parts.join(' ').trim();

  // Append style only if it adds real info
  if (style && style.length > 2 && !/hair styling|hairstyle/.test(style)) {
    detail = `${detail} ${style}`.trim();
  }

  // Collapse double "hair"
  detail = detail.replace(/\bhair hair\b/g, 'hair').replace(/\s+/g, ' ').trim();

  // Deduplicate all words to prevent stutters
  const words = detail.split(/\s+/);
  const uniqueWords: string[] = [];
  for (const w of words) {
    if (w && !uniqueWords.includes(w)) {
      uniqueWords.push(w);
    }
  }
  detail = uniqueWords.join(' ');

  if (!detail || detail.length < 3) return 'medium hair';

  // Add "hair" suffix if no hair word present and no hairstyle term
  const hasHairWord = /hair|bob|pixie|bun|braid|afro|twist|locs|wolf cut|bangs/.test(detail);
  if (!hasHairWord) detail += ' hair';

  return detail;
}

/** Convert board name into a clean, short Pinterest-style hashtag (max 4 words) */
// function boardToHashtag(bd: string): string {
//   const words = bd
//     .replace(/[^a-z0-9\s]/gi, '')
//     .split(/\s+/)
//     .filter(Boolean)
//     .slice(0, 4);
//   return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
// }

/** Build a secondary hashtag from hair detail (max 3 words) */
// function hairDetailToHashtag(detail: string): string {
//   const words = detail
//     .replace(/[^a-z0-9\s]/gi, '')
//     .split(/\s+/)
//     .filter(Boolean)
//     .slice(0, 3);
//   return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
// }

/** Clean known AI noise from title/description and auto-sanitize banned buzzwords */
function cleanText(text: string): string {
  let cleaned = text
    .replace(/\bhair styling hair\b/gi, 'hair')
    .replace(/\bhairstyle hair\b/gi, 'hair')
    .replace(/\bhair hair\b/gi, 'hair')
    .replace(/\s*\+\s*/g, ', ')
    .replace(/\s*\|\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  // Auto-sanitize banned buzzwords into natural Pinterest phrasing
  cleaned = cleaned
    .replace(/\b(stunning|amazing|incredible)\b/gi, 'distinctive')
    .replace(/\b(perfect)\b/gi, 'ideal')
    .replace(/\b(viral|trending)\b/gi, 'popular')
    .replace(/\b(obsession|must-have)\b/gi, 'essential')
    .replace(/\b(perfection)\b/gi, 'elegance')
    .replace(/\b(hair goals|goals)\b/gi, 'inspiration');

  return cleaned;
}

/** Validate a title — returns null if OK, error string if bad */
function validateTitle(title: string): string | null {
  if (!title) return 'Title is empty';
  const t = normalizeBlackCapitalization(title).trim();
  if (t.length < PINTEREST_RULES.titleMin) return `Title too short (${t.length} chars)`;
  if (t.length > PINTEREST_RULES.titleMax) return `Title too long (${t.length} chars)`;
  if (containsPipe(t)) return 'Title contains "|"';
  if (containsEmoji(t)) return 'Title contains emoji';
  if (t.includes('+')) return 'Title contains "+"';
  const banned = containsBannedWord(t);
  if (banned) return `Title contains banned word: "${banned}"`;
  const dup = /\b([a-z]+)\s+\1\b/i.exec(t);
  if (dup) return `Title contains consecutive duplicate word: "${dup[0]}"`;
  return null;
}

/** Check whether description makes false layer claims */
function validateDescription(description: string, visionJSON: any): string | null {
  if (!description) return 'Description is empty';
  const d = normalizeBlackCapitalization(description).trim();
  if (d.length < PINTEREST_RULES.descriptionMin) return `Description too short (${d.length} chars)`;
  if (d.length > PINTEREST_RULES.descriptionMax) return `Description too long (${d.length} chars)`;
  if (!hasCompleteSentence(d)) return 'Description must end with a complete sentence';
  if (containsEmoji(d)) return 'Description contains emoji';
  if (containsHashtag(d)) return 'Description contains hashtag';
  const opener = startsWithBannedOpener(d);
  if (opener) return `Description starts with banned opener: "${opener}"`;
  const banned = containsBannedWord(d);
  if (banned) return `Description contains banned word: "${banned}"`;
  const dup = /\b([a-z]+)\s+\1\b/i.exec(d);
  if (dup) return `Description contains consecutive duplicate word: "${dup[0]}"`;

  if (visionJSON?.category === 'hair') {
    const hasHairLayerClaims = /face-framing layers|lightweight hair layer/i.test(d);
    if (hasHairLayerClaims && visionJSON?.layersVisible === false && (visionJSON?.confidence || 0) > 0.5) {
      return 'Description claims hair layers but visionJSON.layersVisible is false';
    }
  }

  return null;
}

function validateAltText(altText: string): string | null {
  if (!altText) return 'Alt text is empty';
  const a = normalizeBlackCapitalization(altText).trim();
  const wc = wordCount(a);
  if (wc < PINTEREST_RULES.altMinWords) return `Alt text too short (${wc} words)`;
  if (wc > PINTEREST_RULES.altMaxWords) return `Alt text too long (${wc} words)`;
  if (containsEmoji(a)) return 'Alt text contains emoji';
  if (containsHashtag(a)) return 'Alt text contains hashtag';
  if (/[.!?]{2,}$/.test(a)) return 'Alt text punctuation looks malformed';
  return null;
}

/** Check board vs vision for local mismatch protection */
function checkBoardMismatch(bd: string, visionJSON: any): { shouldPost: boolean; mismatchWarning: string } {
  const bangsExpected      = /bangs|fringe|wispy/.test(bd.toLowerCase());
  const braidsExpected     = /braid|protective|twist|locs/.test(bd.toLowerCase());
  const layersExpected     = /layer/.test(bd.toLowerCase());
  const confidence         = visionJSON?.confidence || 0;
  const visStyle           = (visionJSON?.visibleHairStyle || '').toLowerCase();

  if (bangsExpected && visionJSON?.bangsVisible === false && confidence > 0.5) {
    return { shouldPost: false, mismatchWarning: 'Board expects bangs, but the image does not show visible bangs.' };
  }
  if (braidsExpected && visionJSON?.protectiveStyleVisible === false && !/braid|twist|locs/.test(visStyle) && confidence > 0.5) {
    return { shouldPost: false, mismatchWarning: 'Board expects braids/protective style, but the image does not show braids.' };
  }
  if (layersExpected && visionJSON?.layersVisible === false && confidence > 0.6) {
    return { shouldPost: false, mismatchWarning: 'Board expects layers, but the image does not show visible layers. Manual review recommended.' };
  }
  return { shouldPost: true, mismatchWarning: '' };
}

/** Build image-specific fallback — adapts to detected hair type */
function buildSmartFallback(
  patternSeed: number,
  bd: string,
  visionJSON: any
): { title: string; description: string; altText: string } {
  const hairDetail    = buildVisualHairDetail(visionJSON);
  const texture       = cleanHairPhrase(visionJSON?.hairTexture || '');
  const hairStyle     = cleanHairPhrase(visionJSON?.visibleHairStyle || '');
  const color         = cleanHairPhrase(visionJSON?.hairColor || '');
  const length        = cleanHairPhrase(visionJSON?.hairLength || '');

  const isNonHair = visionJSON?.category && visionJSON.category !== 'hair' && visionJSON.category !== 'beauty';
  if (isNonHair) {
    const subject = visionJSON?.primarySubject || bd;
    const colors = visionJSON?.colorPalette || 'neutral tones';
    const style = visionJSON?.aestheticStyle || 'modern';
    return {
      title: `${bd} Design Ideas with ${style} Aesthetic and Clean Details`,
      description: `${subject} showcases a ${style} aesthetic with balanced proportions and ${colors}. Thoughtful textures and natural lighting bring this curated concept together. Save this pin to your board for your next project or styling inspiration.`,
      altText: `${subject} featuring ${colors} and ${style} styling in a well-lit setting.`
    };
  }

  const isProtective  = visionJSON?.protectiveStyleVisible === true || /braid|twist|locs|loc/.test(hairStyle);
  const isWolfCut     = /wolf cut|wolf/.test(hairStyle);
  const isCurly       = /curly|coily|coils|afro/.test(texture) || /curly|coily|afro/.test(hairStyle);
  const isWavy        = /wavy/.test(texture) || /wavy/.test(hairStyle);
  const isBun         = /bun|updo/.test(hairStyle);
  const isPixie       = /pixie/.test(hairStyle);
  const isBob         = /\bbob\b/.test(hairStyle);
  const hasBangs      = visionJSON?.bangsVisible === true || /bangs|fringe|wispy/.test(hairStyle);

  if (isProtective) {
    return {
      title:       `Braided ${bd} Hairstyle for ${color || 'dark'} Hair`,
      description: `${hairDetail} is styled in a braided protective look with natural texture. This style keeps the hair protected and is low-maintenance for everyday wear. The braid pattern sits cleanly close to the scalp. Save this pin for your next hairstyle idea.`,
      altText:     `Person with ${hairDetail} in a neat braided protective style.`
    };
  }

  if (isWolfCut) {
    return {
      title:       `Wolf Cut ${bd} for ${length || 'medium'} Hair`,
      description: `${hairDetail} is styled in a wolf cut shape with visible texture and movement. This hairstyle features shaggy ends and low-maintenance styling. The natural volume through the crown adds dimension. Pin this look for your next hair appointment.`,
      altText:     `Person with ${hairDetail} in a textured wolf cut shape.`
    };
  }

  if (isCurly) {
    return {
      title:       `${bd} Hairstyle with Natural Curls and Volume`,
      description: `${hairDetail} is shown with natural volume and defined curl texture. This look works nicely when the curl pattern is shaped naturally. The texture is maintained cleanly without over-layering. Tap the link for more hairstyle ideas.`,
      altText:     `Person with ${hairDetail} showcasing natural curl volume and texture.`
    };
  }

  if (isWavy) {
    return {
      title:       `Wavy ${bd} Hairstyle with Soft Texture`,
      description: `${hairDetail} is shown with natural wave texture and soft movement. The wave pattern adds volume while keeping the style simple. This look focuses on shaping that works with the natural wave. Reference this before your next barber or stylist visit.`,
      altText:     `Person with ${hairDetail} featuring natural wave texture and soft movement.`
    };
  }

  if (isBun) {
    return {
      title:       `Clean Updo Hairstyle for ${bd}`,
      description: `${hairDetail} is shown in a clean updo style. This look keeps the hair off the face and features neat styling around the edges. It is a practical option for managing length and texture. Save this style for your next protective hairstyle.`,
      altText:     `Person with ${hairDetail} pulled back into a clean updo style.`
    };
  }

  if (hasBangs) {
    const bangsType = cleanHairPhrase(visionJSON?.bangsType || 'soft bangs');
    return {
      title:       `${bd} Hairstyle with ${bangsType} on ${length || 'medium'} Hair`,
      description: `${hairDetail} is shown with ${bangsType} and a clean hair shape. The bangs frame the face and add a styled finish to the overall cut. The look balances the fringe with the rest of the hair length. Save this pin for your next hairstyle idea.`,
      altText:     `Person with ${hairDetail} featuring ${bangsType} and a natural shape.`
    };
  }

  if (isPixie) {
    return {
      title:       `Short Pixie Cut Hairstyle for ${bd}`,
      description: `${hairDetail} is shown in a clean pixie cut shape. The short length offers straightforward styling with texture on the sides. The soft neckline completes the overall short haircut shape. Pin this look for your next hair appointment.`,
      altText:     `Person with ${hairDetail} in a short clean pixie cut.`
    };
  }

  if (isBob) {
    return {
      title:       `Classic Bob Haircut for ${bd}`,
      description: `${hairDetail} is shown in a clean bob shape. The cut frames the face and creates an even line along the perimeter. The length is kept balanced around the jaw or collar area. Tap the link for more hairstyle ideas.`,
      altText:     `Person with ${hairDetail} in a structured bob haircut.`
    };
  }

  const generic = [
    {
      title:       `Natural ${bd} Hairstyle on ${hairDetail}`,
      description: `${hairDetail} is shown with a clean, natural finish. The styling is practical and maintains the hair's natural density and shape. The overall look is straightforward and balanced. Save this pin for your next hairstyle idea.`,
      altText:     `Person with ${hairDetail} styled with a clean natural finish.`
    },
    {
      title:       `Everyday ${bd} Hairstyle Look`,
      description: `${hairDetail} is presented in a practical everyday shape. The styling focuses on maintaining a balanced look with the hair's texture. The approach keeps the shape clean and manageable. Pin this look for your next hair appointment.`,
      altText:     `Person with ${hairDetail} in a practical everyday style.`
    },
    {
      title:       `${bd} Styling Idea for ${hairDetail}`,
      description: `${hairDetail} is shown in a simple arrangement that highlights its natural texture. The approach requires minimal alteration to the hair's baseline shape. The style provides a neat and even finish. Tap the link for more hairstyle ideas.`,
      altText:     `Person with ${hairDetail} styled simply and naturally.`
    },
    {
      title:       `Clean ${bd} Haircut Shape`,
      description: `${hairDetail} is shown with a clean outline and natural texture. The styling maintains the natural flow of the hair without heavy modifications. The cut provides a solid baseline shape. Reference this before your next barber or stylist visit.`,
      altText:     `Person with ${hairDetail} featuring a clean and natural haircut shape.`
    }
  ];

  return generic[patternSeed % generic.length];
}

export class OpenCodeProvider {
  private db: DbManager;

  constructor(db: DbManager) {
    this.db = db;
  }

  private async getClientConfig() {
    const settings = await this.db.getSettings();
    return {
      enabled: settings.aiEnabled !== false,
      apiKey: settings.aiApiKey || process.env.OPENCODE_API_KEY || '',
      baseUrl: settings.aiBaseUrl || process.env.OPENCODE_BASE_URL || 'https://api.opencode.dev/v1',
      model: settings.aiModel || process.env.OPENCODE_MODEL || 'opencode-mimo-v2.5',
      timeout: (settings.aiTimeout || 45) * 1000
    };
  }

  private buildContext(input: AIInput): string {
    const parts: string[] = [];
    if (input.boardName)     parts.push(`Pinterest Board: "${input.boardName}"`);
    if (input.topic)         parts.push(`Topic/Niche: ${input.topic}`);
    if (input.keyword)       parts.push(`Primary Keyword: ${input.keyword}`);
    if (input.tone)          parts.push(`Tone: ${input.tone}`);
    if (input.audience)      parts.push(`Target Audience: ${input.audience}`);
    if (input.imageNotes)    parts.push(`Image Content/Notes: ${input.imageNotes}`);
    if (input.title)         parts.push(`Current Title Draft: ${input.title}`);
    if (input.description)   parts.push(`Current Description Draft: ${input.description}`);
    if (input.destinationUrl) parts.push(`Destination URL: ${input.destinationUrl}`);
    return parts.join('\n');
  }

  public async generateRepinKeywords(boardName: string): Promise<string> {
    const system = `You are a Pinterest SEO expert. 
Given a Pinterest board name, generate ONE highly relevant and optimized search query that a user would type into Pinterest to find content for this board.
Keep it short (2-4 words). No quotes, no explanations, just the search query.`;

    const user = `Board Name: "${boardName}"\nGenerate search query:`;

    try {
      const result = await this.makeChatCompletion(system, user);
      return result.replace(/['"]/g, '').trim() || boardName;
    } catch (e) {
      console.error('Failed to generate repin keywords via AI:', e);
      return boardName; // fallback to just searching the board name
    }
  }

  public async generateRepinKeywordPool(boardName: string, count: number = 5): Promise<string[]> {
    const system = `You are a Pinterest SEO expert.
Given a Pinterest board name, generate ${count} distinct, highly relevant, and randomized search queries that users type on Pinterest to discover pins for this board.
Return ONLY a valid JSON array of strings, e.g. ["query one", "query two", "query three"]. Do not include markdown code blocks or explanations.`;

    const user = `Board Name: "${boardName}"\nGenerate ${count} distinct Pinterest search queries in JSON array:`;

    try {
      const result = await this.makeChatCompletion(system, user);
      const clean = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        const jsonStr = clean.slice(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: any) => String(s).replace(/['"]/g, '').trim()).filter(Boolean);
        }
      }
      return [boardName];
    } catch (e) {
      console.warn('Failed to generate repin keyword pool via AI, falling back to board name:', e);
      return [boardName];
    }
  }

  public async generateTitleSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are an elite Pinterest SEO strategist specializing in 2026 visual search algorithms across all categories (Home Decor, Beauty & Hair, Fashion, Food & Recipes, Lifestyle, Architecture, DIY, and Products).
Generate 5 unique, high-ranking Pin titles.

STRICT 2026 PINTEREST TITLE RULES:
1. 45–80 characters in clean Title Case.
2. Front-load primary search query in the first 30 characters (for mobile card truncation).
3. Include the core topic/subject + 2 specific visual modifiers.
4. STRICTLY ZERO emojis, ZERO hashtags (#), ZERO pipes (|), ZERO plus (+).
5. NO clickbait buzzwords (Must-Have, Stunning, Viral, Obsession, Perfection).
6. Natural, human-written, search-intent driven phrasing.

OUTPUT FORMAT:
Return ONLY a raw JSON array of 5 strings.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.slice(0, 5);
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate titles via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'Modern Inspiration';
      return [
        `${base} Ideas for a Balanced and Clean Aesthetic`,
        `How To Style ${base} with Natural Textures and Warm Accents`,
        `${base} Inspiration Guide for Modern Spaces and Looks`,
        `Effortless ${base} Concepts with Timeless Elegance`,
        `${base} Showcase with Neutral Tones and Refined Detailing`
      ];
    }
  }

  public async generateDescriptionSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are an elite Pinterest SEO copywriter specializing in 2026 visual search and organic discovery across all niches.
Generate 3 unique Pin descriptions.

STRICT 2026 PINTEREST DESCRIPTION RULES:
1. 240–360 characters total.
2. Exactly 3 to 4 complete, grammatical sentences ending with terminal punctuation.
3. Sentence 1 starts directly with the topic or subject keyword.
4. FORBIDDEN BANNED OPENERS: Never start with "Discover", "Achieve", "Get inspired", "Check out", "Looking for", or "In this image".
5. Weave 2–4 high-intent Pinterest search queries naturally into conversational context.
6. Last sentence MUST be a soft, actionable call-to-action (e.g. "Save this pin to your board for your next remodel/styling/project.", "Pin this idea to reference when planning your space/look.").
7. STRICTLY ZERO hashtags (#), ZERO emojis.
8. NO spam buzzwords (stunning, viral, must-have, perfection).

OUTPUT FORMAT:
Return ONLY a raw JSON array of 3 strings.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate descriptions via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'Modern Inspiration';
      return [
        `${base} brings natural balance and clean lines together for an elevated look. Incorporating thoughtful details and neutral textures creates an inviting and enduring feel. Save this pin to your board for your next project or aesthetic inspiration.`,
        `${base} provides an effortless blend of functionality and refined style for modern living. The subtle composition and warm tones work well in any contemporary setting. Pin this look to reference when planning your upcoming space or routine.`,
        `${base} highlights timeless craftsmanship and curated elements with minimal fuss. Focus on balanced proportions and organic accents to achieve this seamless aesthetic. Save this pin for easy reference on your ideas board.`
      ];
    }
  }

  public async improveAltText(input: AIInput): Promise<string> {
    const system = `You are an accessibility and Pinterest Lens SEO specialist.
Write one concise, literal visual accessibility description of the image.

STRICT RULES:
1. 14–22 words total.
2. Accurately describe what is physically visible: subject, colors, textures, lighting, and layout.
3. Include primary subject keyword once naturally.
4. STRICTLY NO marketing copy, NO CTA, NO hashtags, NO emojis, NO URLs.

OUTPUT FORMAT:
Return ONLY the plain alt text string.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      return result.trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      console.error('Failed to improve alt text via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'Curated design';
      return `${base} with natural light, clean textures, and balanced neutral tones in an elegant setting.`;
    }
  }

  public async generateKeywords(input: AIInput): Promise<string[]> {
    const system = `You are an elite Pinterest keyword research expert trained on 2026 search trends across all categories. Generate 15 high-intent Pinterest search queries for the provided niche, board, or topic.

RULES:
1. Mix of short-tail, mid-tail, and long-tail search phrases.
2. Reflect actual Pinterest user search intent (ideas, aesthetic, tutorial, how to, inspiration, modern, minimal, layout, styling).
3. STRICTLY NO hashtags (#). All terms must be plain text search queries.
4. Return ONLY a raw JSON array of 15 strings.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate keywords via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'interior design';
      return [
        base, `${base} ideas`, `${base} aesthetic`, `${base} inspiration`,
        `${base} styling`, `how to style ${base}`, `modern ${base}`,
        `minimalist ${base}`, `${base} layout`, `${base} neutral tones`,
        `${base} for beginners`, `${base} trends 2026`, `${base} cozy`, `${base} tips`, `${base} decor`
      ];
    }
  }

  public async validatePinMetadata(input: AIInput): Promise<{ isValid: boolean; warnings: string[] }> {
    const system = `You are a Pinterest SEO auditor. Analyze this pin's metadata and identify specific issues.

CHECK ALL:
1. TITLE: 45–80 chars, no emoji, no pipe symbols, no banned spam words, natural keyword usage.
2. DESCRIPTION: 220–380 chars, no emoji, no hashtags, complete sentence, natural wording, soft CTA.
3. ALT TEXT: 12–22 words, descriptive only, no CTA, no promotional language.
4. SEMANTIC MATCH: title + description + alt text must match the board and visible hairstyle.
5. HALLUCINATION CHECK: do not mention accessories, extensions, wigs, beads, cuffs, or products unless clearly shown or provided.

Return:
{"isValid": boolean, "warnings": ["specific fix"]}

Each warning must say EXACTLY what to fix and HOW.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      const warnings: string[] = [];
      if (!input.title || input.title.length < PINTEREST_RULES.titleMin) warnings.push(`Title too short. Write ${PINTEREST_RULES.titleMin}-${PINTEREST_RULES.titleMax} characters.`);
      if (input.title && input.title.length > PINTEREST_RULES.titleMax) warnings.push(`Title exceeds ${PINTEREST_RULES.titleMax} characters.`);
      if (!input.description || input.description.length < PINTEREST_RULES.descriptionMin) warnings.push(`Description too short. Write ${PINTEREST_RULES.descriptionMin}-${PINTEREST_RULES.descriptionMax} characters.`);
      if (input.description && input.description.length > PINTEREST_RULES.descriptionMax) warnings.push(`Description exceeds ${PINTEREST_RULES.descriptionMax} characters.`);
      if (input.description && containsHashtag(input.description)) warnings.push('Remove hashtags from description.');
      if (input.title && containsEmoji(input.title)) warnings.push('Remove emojis from title.');
      if (input.description && containsEmoji(input.description)) warnings.push('Remove emojis from description.');
      if (!input.destinationUrl || !input.destinationUrl.startsWith('http')) warnings.push('Destination URL missing. Add a valid https:// URL.');
      return { isValid: warnings.length === 0, warnings };
    }
  }

  public async generateSEOComplete(input: AIInput): Promise<{ title: string; description: string; altText: string }> {
    const system = `You are an elite Pinterest SEO strategist trained on 2026 Pinterest Visual Discovery & Lens ranking algorithms across all niches (Home Decor, Beauty & Hair, Fashion, Food & Recipes, Lifestyle, Architecture, DIY, and Products).
Write high-converting, search-optimized Pin metadata based strictly on the provided context.

STRICT 2026 PINTEREST RANKING RULES:
1. TITLE (45–80 characters):
   - Natural user search query written in clean Title Case.
   - Front-load primary search query in the first 30 characters (mobile grid truncation).
   - Combine core subject + 2 specific visual modifiers.
   - STRICTLY ZERO emojis, ZERO hashtags (#), ZERO pipes (|), ZERO plus signs (+).
   - NO clickbait buzzwords (Must-Have, Stunning, Viral, Obsession, Perfection).

2. DESCRIPTION (240–360 characters):
   - Exactly 3 to 4 complete, well-formed sentences ending with a period.
   - Sentence 1 starts directly with the topic or subject keyword.
   - FORBIDDEN BANNED OPENERS: Never start with "Discover", "Achieve", "Get inspired", "Check out", "Looking for", or "In this image".
   - Naturally weave 2 to 4 high-intent Pinterest search queries into conversational context.
   - Final sentence MUST be a natural, soft call-to-action (e.g. "Save this pin to your board for your next remodel/styling/project.", "Pin this idea to reference when planning your space/look.").
   - STRICTLY ZERO hashtags (#), ZERO emojis.

3. ALT TEXT (14–22 words):
   - Exactly one complete literal accessibility sentence describing what is physically visible.
   - Describe subjects, colors, materials, lighting, and layout for Pinterest Lens and screen readers.
   - NO marketing copy, NO CTA, NO hashtags, NO URLs.

Return ONLY raw JSON:
{"title":"","description":"","altText":""}`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: cleanText(parsed.title || ''),
        description: parsed.description || '',
        altText: parsed.altText || ''
      };
    } catch (e) {
      console.error('Failed to generate complete SEO via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'Modern Inspiration';
      return {
        title: `${base} Ideas for a Balanced and Clean Aesthetic`,
        description: `${base} brings natural balance and clean lines together for an elevated look. Incorporating thoughtful details and neutral textures creates an inviting and enduring feel. Save this pin to your board for your next project or aesthetic inspiration.`,
        altText: `${base} with natural light, clean textures, and balanced neutral tones in an elegant setting.`
      };
    }
  }

  public async syncCloudflareKeysPool(): Promise<{ accountId: string; token: string }[]> {
    const now = Date.now();
    if (_keyPoolCache.length > 0 && (now - _keyPoolCacheTime) < KEY_POOL_CACHE_TTL_MS) {
      return _keyPoolCache; // Use in-memory cache, no disk I/O
    }

    const pool: { accountId: string; token: string }[] = [];
    const nowSec = now / 1000;

    // ── PRIMARY: Load from local project file — check all possible paths ──
    const localPaths = [
      LOCAL_CF_ACCOUNTS_PATH,                                                        // resolved _PROJECT_ROOT/cloudflare_accounts.txt
      process.resourcesPath ? path.join(process.resourcesPath, 'cloudflare_accounts.txt') : null,  // packaged .exe resources/
      path.join(getUserDataPath(), 'cloudflare_accounts.txt'),                // user placed file in AppData
      path.join(__dirname, '..', '..', 'cloudflare_accounts.txt'),                  // dev fallback
      path.join(__dirname, '..', '..', 'cloudflare_working_accounts.txt'),          // legacy name
    ].filter(Boolean) as string[];

    for (const txtPath of localPaths) {
      if (fs.existsSync(txtPath)) {
        try {
          const content = fs.readFileSync(txtPath, 'utf8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split(',');
            if (parts.length >= 2) {
              const accId = parts[0].trim();
              const token = parts[1].trim();
              if (accId && token.startsWith('cfut_') && !pool.some(p => p.token === token)) {
                pool.push({ accountId: accId, token });
              }
            }
          }
          if (pool.length > 0) break; // Found accounts — stop searching
        } catch (err) { console.error('[CF Pool] Error reading accounts file:', err); }
      }
    }

    // ── Load exhausted-account map (local status only) ──
    let exhaustedMap: Record<string, number> = {};
    if (fs.existsSync(LOCAL_CF_STATUS_PATH)) {
      try { exhaustedMap = JSON.parse(fs.readFileSync(LOCAL_CF_STATUS_PATH, 'utf8')); } catch {}
    }

    // Filter out accounts marked exhausted until their cooldown expires
    const workingPool = pool.filter(cred => (exhaustedMap[cred.token] || 0) <= nowSec);
    console.log(`[CF Pool] Loaded: ${pool.length} total, ${workingPool.length} working (${pool.length - workingPool.length} rate-limited)`);

    if (workingPool.length === 0 && pool.length > 0) {
      // All are exhausted — reset and try again (they may have recovered)
      console.warn('[CF Pool] All accounts exhausted — resetting cooldowns and retrying with full pool.');
      try { fs.writeFileSync(LOCAL_CF_STATUS_PATH, '{}'); } catch {}
      _keyPoolCache = pool;
    } else {
      _keyPoolCache = workingPool;
    }
    _keyPoolCacheTime = now;
    return _keyPoolCache;
  }

  private async makeChatCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    const workingPool = await this.syncCloudflareKeysPool().catch(() => [] as { accountId: string; token: string }[]);
    const config = await this.getClientConfig();
    let attempts = 0;
    const maxAttempts = Math.max(1, Math.min(5, workingPool.length || 1));

    while (attempts < maxAttempts) {
      attempts++;
      let apiKey    = config.apiKey;
      let baseUrl   = config.baseUrl;
      let accountId = '';
      let model     = config.model;
      const isCloudflare = config.baseUrl.includes('cloudflare.com') || config.apiKey.startsWith('cfut_') || (workingPool.length > 0 && !config.apiKey);

      if (isCloudflare) {
        if (workingPool.length > 0) {
          const sel = workingPool[Math.floor(Math.random() * workingPool.length)];
          apiKey    = sel.token;
          accountId = sel.accountId;
          baseUrl   = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
        }
        if (!model || model === 'opencode-big-pickle') model = '@cf/meta/llama-3.1-70b-instruct'; // Best quality + speed: 6.7s, perfect 64-char titles
      }

      if (!apiKey) throw new Error('API key is missing. Please configure your AI API key in Settings.');

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), config.timeout);

      try {
        let response: Response;
        if (isCloudflare) {
          const runUrl = `${baseUrl.replace(/\/+$/, '')}/${model}`;
          response = await fetch(runUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body:    JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
            signal:  controller.signal
          });
        } else {
          const chatUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
          response = await fetch(chatUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body:    JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7 }),
            signal:  controller.signal
          });
        }
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`AI request attempt ${attempts} failed (${response.status}): ${errorText}`);
          if (isCloudflare && (response.status === 429 || response.status === 401)) {
            _keyPoolCacheTime = 0;
            await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempts - 1) + Math.random() * 500, 8000)));
            continue;
          }
          throw new Error(`AI API error (${response.status}): ${errorText || response.statusText}`);
        }

        const data = await response.json();
        if (isCloudflare) {
          const result = data.result;
          if (result) {
            if (result.choices?.[0]?.message?.content) return result.choices[0].message.content;
            if (result.response)                       return result.response;
            if (result.text)                           return result.text;
            if (typeof result === 'string')            return result;
          }
          return JSON.stringify(data.result || '');
        } else {
          return data.choices?.[0]?.message?.content || '';
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (attempts >= maxAttempts) throw e;
        console.warn(`AI call attempt ${attempts} failed: ${e.message}. Retrying...`);
        await new Promise(r => setTimeout(r, Math.min(800 * attempts + Math.random() * 400, 5000)));
      }
    }
    throw new Error('AI Chat Completion failed after all attempts.');
  }

  // ══════════════════════════════════════════════════════════════════
  // analyzeImage — 2-Stage AI System
  // Mode A (BEST):  imagePrompt provided → skip Stage 1 entirely,
  //                 use prompt directly as truth source in Stage 2
  // Mode B:         no prompt → Stage 1 vision (Llama 4 Scout) → Stage 2
  // Fallback:       Smart image-type-aware templates (never auto-posted)
  // ══════════════════════════════════════════════════════════════════
  public async analyzeImage(
    imagePath: string,
    boardName?: string,
    topic?: string,
    destinationUrl?: string,
    imagePrompt?: string
  ): Promise<AnalyzeImageResult> {

    // Warn if no destination URL
    if (!destinationUrl) {
      console.warn('[analyzeImage] Destination URL missing. This pin may not drive traffic.');
    }

    const cleanPrompt = (imagePrompt || '').trim();
    const hasPrompt   = cleanPrompt.length > 5;

    if (hasPrompt) {
      console.log(`[analyzeImage] Prompt mode — skipping Stage 1 vision. Prompt: "${cleanPrompt.slice(0, 80)}..."`);
    }

    const config = await this.getClientConfig();
    let model = config.model;
    if (!model || model === 'opencode-big-pickle') {
      model = '@cf/meta/llama-3.1-70b-instruct'; // Best quality + speed: 6.7s, perfect 64-char titles
    }

    const workingPool = await this.syncCloudflareKeysPool().catch(() => [] as { accountId: string; token: string }[]);
    if (workingPool.length === 0) throw new Error('No Cloudflare AI keys found. Please add keys to cloudflare_working_accounts.txt.');

    let imageUint8: number[] = [];

    if (!hasPrompt) {
      if (!fs.existsSync(imagePath))  throw new Error(`Image file not found: ${imagePath}`);
      try {
        const image = nativeImage.createFromPath(imagePath);
        const size  = image.getSize();
        let resized = image;
        if (size.width > 800 || size.height > 800) {
          const scale = 800 / Math.max(size.width, size.height);
          resized = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
        }
        const buf = resized.toJPEG(75);
        imageUint8 = Array.from(new Uint8Array(buf));
      } catch {
        const buf = fs.readFileSync(imagePath);
        imageUint8 = Array.from(new Uint8Array(buf));
      }
    }

    // Clean filename — strip AI/stock naming noise
    const rawName = path.basename(imagePath, path.extname(imagePath))
      .replace(/[-_]/g, ' ')
      .replace(/\b\d{4,}\b/g, '')
      .replace(/\b\d+\b/g, '')
      .replace(/\b(a|an|the)\b/gi, '')
      .replace(/\bA realistic (phone )?photo of\b/gi, '')
      .replace(/\bA photo of\b/gi, '')
      .replace(/\bPhoto of\b/gi, '')
      .replace(/\bWoman with\b/gi, '')
      .replace(/\bMan with\b/gi, '')
      .replace(/\bPerson with\b/gi, '')
      .replace(/\bGirl with\b/gi, '')
      .replace(/\bLady with\b/gi, '')
      .replace(/\bModel with\b/gi, '')
      .replace(/\bHair inspo aesthetic\b/gi, '')
      .replace(/\bHair inspo\b/gi, '')
      .replace(/\baesthetic\b/gi, '')
      .replace(/\bliving\b/gi, '')
      .replace(/\bstreet\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const _firstCharRaw = rawName.trim().charCodeAt(0);
    const patternSeed   = Number.isFinite(_firstCharRaw) ? _firstCharRaw % 4 : 0;

    // Transform board name into clean Pinterest keyword
    const bdRaw = boardName || topic || 'layered hair';
    const bd    = bdRaw
      .toLowerCase()
      .replace(/\bvery layered\b/gi, 'layered')
      .replace(/\bhair medium\b/gi, 'hair')
      .replace(/\bmedium over (\d+)\b/gi, 'over $1')
      .replace(/\binspiration\b/gi, '')
      .replace(/\bideas\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // ── PARALLEL RACE: pick N unique creds round-robin ──────────────────────────
    const pickCredsRoundRobin = (n: number) => {
      const selected: { accountId: string; token: string }[] = [];
      const poolLen = workingPool.length;
      if (poolLen === 0) return selected;
      for (let i = 0; i < n && i < poolLen; i++) {
        selected.push(workingPool[(_globalCfRoundRobinIndex + i) % poolLen]);
      }
      _globalCfRoundRobinIndex = (_globalCfRoundRobinIndex + n) % poolLen;
      return selected;
    };

    // ── Marks a token as rate-limited for 1 hour ─────────────────────────────────
    const markExhausted = (token: string) => {
      try {
        let map: Record<string, number> = {};
        if (fs.existsSync(LOCAL_CF_STATUS_PATH)) {
          try { map = JSON.parse(fs.readFileSync(LOCAL_CF_STATUS_PATH, 'utf8')); } catch {}
        }
        map[token] = Date.now() / 1000 + 3600; // 1 hour cooldown
        fs.writeFileSync(LOCAL_CF_STATUS_PATH, JSON.stringify(map, null, 2));
        // Also evict from in-memory pool
        _keyPoolCache = _keyPoolCache.filter(c => c.token !== token);
        console.warn(`[CF Pool] Marked exhausted: ${token.slice(0, 16)}... (${_keyPoolCache.length} remaining)`);
      } catch {}
    };

    // ── Core fetch for a single Cloudflare account ───────────────────────────────
    const makeAttempt = async (cred: { accountId: string; token: string }, req: { url: string; body: any }): Promise<string> => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 60000); // 60s timeout — Kimi 2.6 needs up to 23s
      try {
        const res = await fetch(req.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.token}` },
          body:    JSON.stringify(req.body),
          signal:  ctrl.signal
        });
        clearTimeout(tid);
        if (res.status === 429) {
          markExhausted(cred.token);
          throw new Error(`Rate limited (429): ${cred.token.slice(0, 16)}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success === false || (Array.isArray(data.errors) && data.errors.length > 0)) {
          throw new Error(`CF Error: ${data.errors?.[0]?.message || 'model error'}`);
        }
        const text = data.result?.choices?.[0]?.message?.content
          || data.result?.response
          || data.result?.text
          || '';
        if (!text) throw new Error('Empty response from Cloudflare');
        return text;
      } catch (e) { clearTimeout(tid); throw e; }
    };

    // FAST PARALLEL RACING: picks 5 unique accounts via round-robin and races them simultaneously.
    // With 86 accounts, 5 concurrent image requests each get a DIFFERENT set of 5 accounts,
    // meaning zero overlap and no rate-limit conflicts between simultaneous bulk jobs.
    const RACE_SIZE = 5;
    const raceCloudflare = async (
      buildRequest: (cred: { accountId: string; token: string }) => { url: string; body: any },
      _hardTimeoutMs: number  // kept for API compat
    ): Promise<string> => {
      if (workingPool.length === 0) throw new Error('No Cloudflare accounts available.');

      const maxWaves = Math.ceil(workingPool.length / RACE_SIZE);
      for (let wave = 0; wave < maxWaves; wave++) {
        // Pick RACE_SIZE unique accounts via global round-robin so concurrent calls use different accounts
        const creds = pickCredsRoundRobin(Math.min(RACE_SIZE, workingPool.length));
        if (creds.length === 0) break;
        console.log(`[CF Race] Wave ${wave + 1}/${maxWaves}: racing ${creds.length} accounts simultaneously (Promise.any)...`);
        try {
          // Promise.any = first success wins, others are cancelled
          const result = await Promise.any(
            creds.map(cred => makeAttempt(cred, buildRequest(cred)))
          );
          return result;
        } catch (aggErr: any) {
          // All racers in this wave failed — try next wave
          console.warn(`[CF Race] Wave ${wave + 1} all failed. Trying next wave of accounts...`);
        }
      }
      throw new Error('raceCloudflare: all waves exhausted — no Cloudflare account responded.');
    };


    const extractJSON = (raw: any): any => {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      let s = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = s.indexOf('{');
      const end   = s.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(s.slice(start, end + 1));
        } catch {}
      }
      // If no valid JSON object was found, wrap text as visual description
      return {
        primarySubject: s.slice(0, 100).replace(/\n+/g, ' '),
        category: 'other',
        keyVisualElements: [s.slice(0, 150)],
        colorPalette: 'natural tones',
        settingOrLighting: 'ambient lighting',
        aestheticStyle: 'modern',
        confidence: 0.85
      };
    };

    // ══════════════════════════════════════════════════════
    // STAGE 1 — VISION ANALYSIS (Llama 3.2 Vision)
    // ══════════════════════════════════════════════════════
    const visionPrompt = `You are an elite visual content analyst for Pinterest pins across all categories (Home Decor, Architecture, Hairstyle & Beauty, Fashion, Food & Recipes, Lifestyle, Products, and DIY).
Examine this image carefully and extract ONLY what is truly visible. Do not guess. Do not invent.

Return ONLY raw JSON, no markdown, no code blocks:
{
  "primarySubject": "short 2-4 word description of what is visible",
  "category": "home_decor|hair|beauty|fashion|food|lifestyle|outdoor|tech|other",
  "keyVisualElements": ["3 to 6 distinct physical objects, textures, materials, or features seen"],
  "colorPalette": "prominent colors visible",
  "settingOrLighting": "lighting and atmosphere",
  "aestheticStyle": "e.g. minimalist, modern, Scandinavian, boho, vintage, industrial, sleek, rustic, luxury, etc.",
  "confidence": 0.95
}`;

    let visionJSON: any = null;

    // ══════════════════════════════════════════════════════
    // STAGE 1 — skipped when imagePrompt is provided
    // ══════════════════════════════════════════════════════
    if (hasPrompt) {
      // Build synthetic visionJSON from prompt so mismatch/fallback helpers still work
      const rawPromptWords = cleanPrompt.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
      const promptWords = Array.from(new Set(rawPromptWords));
      visionJSON = {
        primarySubject:         promptWords.slice(0, 3).join(' ') || cleanPrompt.slice(0, 35),
        category:               'other',
        keyVisualElements:      promptWords.slice(0, 5),
        colorPalette:           'natural tones',
        settingOrLighting:      'natural ambient lighting',
        aestheticStyle:         'modern aesthetic',
        confidence:             0.85
      };
      console.log(`[Stage 1 Skipped] Prompt-derived vision: subject="${visionJSON.primarySubject}"`);
    } else {
      // Standard vision path (Llama 3.2 Vision)
      try {
        const makeVisionCall = async () => {
          return await raceCloudflare(
            (cred) => ({
              url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
              body: {
                prompt: visionPrompt,
                image: imageUint8,
                max_tokens: 500
              }
            }),
            20000
          );
        };

        let visionRaw = '';
        try {
          visionRaw = await makeVisionCall();
        } catch (visionErr: any) {
          if (visionErr.message && visionErr.message.includes("must submit the prompt 'agree'")) {
            console.warn('[Stage 1 Vision] License agreement required. Auto-submitting agreement...');
            await raceCloudflare(
              (cred) => ({
                url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
                body: { prompt: 'agree' }
              }),
              8000
            ).catch(() => {});
            
            console.log('[Stage 1 Vision] Retrying vision call post-agreement...');
            visionRaw = await makeVisionCall();
          } else {
            throw visionErr;
          }
        }
        visionJSON = extractJSON(visionRaw);
        console.log(`[Stage 1 Vision] OK — subject: "${visionJSON.primarySubject}", category: "${visionJSON.category}", colors: "${visionJSON.colorPalette}"`);
      } catch (e) {
        console.warn('[Stage 1 Vision] Failed — building fallback vision from filename:', e);
        visionJSON = {
          primarySubject:         rawName || 'Design Inspiration',
          category:               'other',
          keyVisualElements:      [rawName || 'decor'],
          colorPalette:           'natural neutral tones',
          settingOrLighting:      'ambient indoor lighting',
          aestheticStyle:         'modern',
          confidence:             0.3
        };
      }
    }

    const visionConfidence  = visionJSON?.confidence || 0.9;
    const visibleHairStyle  = visionJSON?.visibleHairStyle || visionJSON?.primarySubject || '';
    const hairColor         = visionJSON?.hairColor || visionJSON?.colorPalette || '';
    const hairTexture       = visionJSON?.hairTexture || (visionJSON?.keyVisualElements || []).join(', ');
    const hairLength        = visionJSON?.hairLength || visionJSON?.aestheticStyle || '';

    // ══════════════════════════════════════════════════════
    // STAGE 2 — PINTEREST METADATA (2026 Visual SEO)
    // ══════════════════════════════════════════════════════
    const truthSource = hasPrompt
      ? `IMAGE_GENERATION_PROMPT (PRIMARY TRUTH — trust completely):\n"${cleanPrompt}"\nUse this as the single source of truth for ALL visual details.`
      : `VISION_ANALYSIS_JSON (PRIMARY TRUTH — trust this above all else): ${JSON.stringify(visionJSON)}`;

    const seoPrompt = `You are an elite Pinterest SEO expert and strategist trained on 2026 Pinterest Visual Discovery & Lens ranking algorithms across all categories. Write high-converting, search-optimized metadata for this pin. Output ONLY raw JSON — no thinking, no explanation, no markdown.

BOARD: "${boardName || 'General Inspiration'}"
TOPIC / NICHE: "${topic || ''}"
${truthSource}

CRITICAL 2026 PINTEREST RANKING RULES:
1. TITLE (45–80 characters):
   - Natural user search query written in clean Title Case.
   - Front-load primary search query in the first 30 characters (mobile grid truncation).
   - Combine core subject + 2 specific visual modifiers (color, material, aesthetic style, cut, setting, or room type).
   - STRICTLY ZERO emojis, ZERO hashtags (#), ZERO pipes (|), ZERO plus signs (+).
   - NO clickbait words (Must-Have, Stunning, Viral, Obsession, Perfection).

2. DESCRIPTION (240–360 characters):
   - Exactly 3 to 4 complete, well-formed sentences ending with a period.
   - Sentence 1 starts directly with the topic or subject keyword.
   - FORBIDDEN BANNED OPENERS: Never start with "Discover", "Achieve", "Get inspired", "Check out", "Looking for", or "In this image".
   - Naturally weave 2 to 4 high-intent Pinterest search queries into conversational context.
   - Final sentence MUST be a natural, soft call-to-action (e.g. "Save this pin to your board for your next remodel/styling/project.", "Pin this idea to reference when planning your space/look.").
   - STRICTLY ZERO hashtags (#), ZERO emojis.

3. ALT TEXT (14–22 words):
   - Exactly one complete literal accessibility sentence describing what is physically visible.
   - Describe subjects, colors, materials, lighting, and layout for Pinterest Lens and screen readers.
   - NO marketing copy, NO CTA, NO hashtags, NO URLs.

Return ONLY this JSON:
{"suggestedBoardKeyword":"","boardFit":"strong","shouldPost":true,"boardFitReason":"","mismatchWarning":"","title":"","description":"","altText":""}`;

    try {
      const seoRaw = await raceCloudflare(
        (cred) => ({
          url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${model}`,
          body: { 
            messages: [{ role: 'user', content: seoPrompt }], 
            temperature: 0.6, 
            max_tokens: 800  // 800 is enough for Llama (no thinking blocks); was 1500 for Kimi which caused 36s delays
          }
        }),
        30000  // 30s timeout — Llama-3.3-70B-FAST responds in ~6s
      );

      const parsed = extractJSON(seoRaw);
      if (!parsed.title || !parsed.description) throw new Error('Incomplete Stage 2 response');

      // Post-process to clean any remaining noise and auto-sanitize
      let cleanedTitle       = cleanText(parsed.title || '');
      let cleanedDescription = cleanText(parsed.description || '');
      let cleanedAlt         = cleanText(parsed.altText || '');

      // Auto-trim title if slightly over
      if (cleanedTitle.length > PINTEREST_RULES.titleMax) {
        cleanedTitle = cleanedTitle.slice(0, PINTEREST_RULES.titleMax).replace(/\s+[^\s]*$/, '');
      }

      // Auto-trim description to last complete sentence under max
      if (cleanedDescription.length > PINTEREST_RULES.descriptionMax) {
        cleanedDescription = safeTrimToSentence(cleanedDescription, PINTEREST_RULES.descriptionMax);
      }
      if (!/[.!?]$/.test(cleanedDescription)) {
        cleanedDescription += '.';
      }

      // Validate output quality
      const titleError = validateTitle(cleanedTitle);
      const descError  = validateDescription(cleanedDescription, visionJSON);

      if (titleError || descError) {
        console.warn(`[Stage 2 Validation] Rejected AI output — ${titleError || descError}. Falling back.`);
        throw new Error(`Validation failed: ${titleError || descError}`);
      }

      const audit = auditSEOOutput(cleanedTitle, cleanedDescription, cleanedAlt, boardName || '', cleanPrompt);
      let finalTitle       = cleanedTitle;
      let finalDescription = cleanedDescription;
      let finalAlt         = cleanedAlt;
      let finalBoardFit    = parsed.boardFit || 'unknown';
      let finalKeyword     = parsed.suggestedBoardKeyword || bd;
      let retried          = false;

      let retryCount = 0;
      const MAX_RETRIES = 1; // Speed: only 1 retry max — avoid multi-round Kimi calls

      // ── AUTO-RETRY if audit score < 50 (was 70) — less aggressive for speed ────
      while (audit.score < 50 && retryCount < MAX_RETRIES) {
        retryCount++;
        console.warn(`[Audit] Score ${audit.score}/100 — issues: ${audit.issues.join('; ')}. Auto-retrying with feedback (Attempt ${retryCount}/${MAX_RETRIES})...`);
        const retryPrompt = `You are a senior Pinterest SEO strategist. Your PREVIOUS attempt to write metadata for this pin was rejected because of quality issues.

ORIGINAL INPUTS:
BOARD: ${boardName || 'none'}
IMAGE PROMPT: ${cleanPrompt || 'none'}

YOUR PREVIOUS (REJECTED) OUTPUT:
- Title: "${finalTitle}"
- Description: "${finalDescription}"
- Alt text: "${finalAlt}"

QUALITY AUDIT FAILED with score ${audit.score}/100. SPECIFIC ISSUES TO FIX:
${audit.issues.map(i => '• ' + i).join('\n')}

Now write CORRECTED Pinterest metadata that fixes ALL the above issues.
Rules:
• Title: 40-100 chars, natural Pinterest search query, no "+", no "hair hair", include board keyword naturally
• Description: 100-400 chars, specific to the actual style shown, no generic filler, include 2-3 relevant keywords
• Alt text: 1 accurate sentence, max 20 words, describe what is literally in the image
• shouldPost: true only if content matches board

Return ONLY raw JSON:
{"suggestedBoardKeyword":"","boardFit":"strong","shouldPost":true,"boardFitReason":"","mismatchWarning":"","title":"","description":"","altText":""}`;

        try {
          const retryRaw = await raceCloudflare(
            (cred) => ({
              url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${model}`,
              body: { 
                messages: [{ role: 'user', content: model.includes('kimi') ? `${retryPrompt}\nIMPORTANT: Output ONLY the JSON object immediately. Do NOT include reasoning or explanation outside the JSON.` : retryPrompt }], 
                temperature: 0.7, 
                max_tokens: 800
              }
            }),
            60000
          );
          const retryParsed = extractJSON(retryRaw);
          if (retryParsed.title && retryParsed.description) {
            const rt = cleanText(retryParsed.title);
            const rd = cleanText(retryParsed.description);
            const ra = cleanText(retryParsed.altText || '');
            const retryAudit = auditSEOOutput(rt, rd, ra, boardName || '', cleanPrompt);
            console.log(`[Auto-Retry ${retryCount}] Score improved: ${audit.score} → ${retryAudit.score}.`);
            if (retryAudit.score >= audit.score) {
              finalTitle       = rt;
              finalDescription = rd;
              finalAlt         = ra;
              finalBoardFit    = retryParsed.boardFit || finalBoardFit;
              finalKeyword     = retryParsed.suggestedBoardKeyword || finalKeyword;
              audit.score      = retryAudit.score;
              audit.issues     = retryAudit.issues;
            }
          }
          retried = true;
        } catch (retryErr) {
          console.warn(`[Auto-Retry ${retryCount}] Retry call failed:`, retryErr);
          retried = true; // Still mark as retried even on failure
        }
      }
      // ─────────────────────────────────────────────────────────

      console.log(`[Stage 2 SEO] OK — board fit: ${parsed.boardFit}, keyword: "${finalKeyword}", title: "${finalTitle}", audit: ${audit.score}/100`);
      if (parsed.mismatchWarning) console.warn(`[Board Mismatch] ${parsed.mismatchWarning}`);

      const finalNormalized = normalizeFinalSEO(finalTitle, finalDescription, finalAlt, visionJSON);
      
      return {
        title:                safeTrimToSentence(finalNormalized.title, PINTEREST_RULES.titleMax),
        description:          safeTrimToSentence(finalNormalized.description, PINTEREST_RULES.descriptionMax),
        altText:              finalNormalized.altText,
        shouldPost:           parsed.shouldPost !== false,
        mismatchWarning:      parsed.mismatchWarning || '',
        source:               'stage2_ai',
        suggestedBoardKeyword: finalKeyword,
        boardFit:             finalBoardFit as any,
        visionConfidence,
        visibleHairStyle,
        hairColor,
        hairTexture,
        hairLength,
        auditScore:   audit.score,
        auditIssues:  [...audit.issues, ...finalNormalized.issues],
        auditRetried: retried
      };
    } catch (e) {
      console.warn('[Stage 2 SEO] Failed or rejected — using smart fallback. Post requires manual review.', e);
    }

    // ══════════════════════════════════════════════════════
    // SMART FALLBACK — image-type-aware, always needs review
    // ══════════════════════════════════════════════════════
    const { shouldPost: mismatchShouldPost, mismatchWarning: mismatchMsg } = checkBoardMismatch(bd, visionJSON);
    const fallback = buildSmartFallback(patternSeed, bd, visionJSON);

    // Post-process fallback titles too
    const fallbackTitle = cleanText(fallback.title);
    const fallbackDesc  = cleanText(fallback.description);

    const finalMismatchWarning = mismatchMsg || 'Fallback metadata used because Stage 2 SEO failed or was rejected. Manual review recommended before posting.';

    console.log(`[Fallback] Used. Title: "${fallbackTitle}". shouldPost: false.`);

    const fallbackNormalized = normalizeFinalSEO(fallbackTitle, fallbackDesc, fallback.altText, visionJSON);
    
    return {
      title:                safeTrimToSentence(fallbackNormalized.title, PINTEREST_RULES.titleMax),
      description:          safeTrimToSentence(fallbackNormalized.description, PINTEREST_RULES.descriptionMax),
      altText:              fallbackNormalized.altText,
      shouldPost:           false,
      mismatchWarning:      finalMismatchWarning,
      source:               'fallback',
      suggestedBoardKeyword: bd,
      boardFit:             mismatchMsg ? 'mismatch' : 'unknown',
      visionConfidence,
      visibleHairStyle,
      hairColor,
      hairTexture,
      hairLength,
      auditScore:   0,
      auditIssues:  ['Fallback metadata used — Stage 2 AI failed or was rejected', ...fallbackNormalized.issues],
      auditRetried: false
    };
  }
}
