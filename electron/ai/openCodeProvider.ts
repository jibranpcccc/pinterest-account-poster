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
  return /\p{Emoji}/u.test(text || '');
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
    const promptKeywords = imagePrompt.toLowerCase().match(/\b(curly|wavy|straight|braids?|cornrow|freehand|natural|loc|twist|afro|blonde|brunette|dark|short|long|medium|pixie|bob|bangs|layers?|protective|crochet|zigzag|wolf cut|shag)\b/g) || [];
    const matchedPromptWords = promptKeywords.filter(k => tl.includes(k) || dl.includes(k));
    if (promptKeywords.length > 0 && matchedPromptWords.length === 0) {
      issues.push('Output does not reflect key terms from the generation prompt'); score -= 25;
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
const _PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  const cwdHasAccounts = require('fs').existsSync(path.join(cwd, 'cloudflare_accounts.txt'));
  if (cwdHasAccounts) return cwd;
  // Fallback: try walking up from __dirname
  for (const rel of ['.', '..', '../..']) {
    const p = path.resolve(__dirname, rel);
    if (require('fs').existsSync(path.join(p, 'cloudflare_accounts.txt'))) return p;
  }
  return cwd; // best-effort
})();

// ── Local status file — keeps track of exhausted (429) accounts ──
const LOCAL_CF_STATUS_PATH = path.join(app.getPath('userData'), 'cloudflare_status.json');
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
function boardToHashtag(bd: string): string {
  const words = bd
    .replace(/[^a-z0-9\s]/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Build a secondary hashtag from hair detail (max 3 words) */
function hairDetailToHashtag(detail: string): string {
  const words = detail
    .replace(/[^a-z0-9\s]/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Clean known AI noise from title/description */
function cleanText(text: string): string {
  return text
    .replace(/\bhair styling hair\b/gi, 'hair')
    .replace(/\bhairstyle hair\b/gi, 'hair')
    .replace(/\bhair hair\b/gi, 'hair')
    .replace(/\s*\+\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
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

  const hasLayerClaims = /\blayers?\b|face-framing layers|lightweight layer/i.test(d);
  if (hasLayerClaims && visionJSON?.layersVisible === false && (visionJSON?.confidence || 0) > 0.5) {
    return 'Description claims layers but visionJSON.layersVisible is false';
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
      model: settings.aiModel || process.env.OPENCODE_MODEL || 'opencode-big-pickle',
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

  public async generateTitleSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO copywriter for the hairstyle niche.
Generate 5 unique pin titles.

RULES:
1. Titles must be 45–85 characters.
2. No emoji.
3. No hashtags.
4. No pipe symbols.
5. No clickbait.
6. No spam words like stunning, amazing, perfect, viral, trending, obsession, must-have, or hair goals.
7. Use the board keyword or a natural variation when relevant.
8. Include the hairstyle name clearly.
9. Make titles natural, searchable, and human-written.
10. Use clean title case.
11. Vary title structures across the 5 options.

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
      const keyword = input.keyword || input.topic || input.boardName || 'layered hair';
      return [
        `${keyword} On Dark Wavy Hair That Frames The Face`,
        `How To Style A ${keyword} Haircut`,
        `${keyword} Hairstyle For Round Faces And Fine Hair`,
        `${keyword} Cut With Soft Face-Framing Layers`,
        `${keyword} For Thick Hair That Adds Natural Volume`
      ];
    }
  }

  public async generateDescriptionSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO copywriter for the hairstyle niche.
Generate 3 unique pin descriptions.

RULES:
1. Each description must be 220–380 characters.
2. No emoji.
3. No hashtags.
4. Do not start every description with the same word.
5. Never start with Discover, Achieve, Check out, Looking for, or Get inspired.
6. Use 2–4 relevant SEO terms naturally.
7. Describe only what is clearly shown or stated.
8. Do not invent accessories, extensions, beads, cuffs, wigs, or products unless explicitly provided.
9. End with a soft CTA.
10. Every description must end with a complete sentence.
11. Avoid spam words like stunning, amazing, perfect, viral, trending, obsession, must-have, or hair goals.

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
      const kw = input.keyword || input.topic || input.boardName || 'layered hair';
      const board = input.boardName || 'hair styling';
      return [
        `${kw} creates soft movement and dimension that works on many face shapes. The stylist used face-framing pieces with lightweight ends for texture. Save this pin for your next hairstyle idea.`,
        `${kw} gives a clean finish that suits various face shapes. The cut includes soft shaping through the mid-lengths and shorter pieces around the face. Pin this look for your next hair appointment.`,
        `${kw} works well with natural texture and requires minimal heat styling. The length is kept balanced around the shoulders for a practical finish. Tap the link for more hairstyle ideas.`
      ];
    }
  }

  public async improveAltText(input: AIInput): Promise<string> {
    const system = `You are an accessibility and Pinterest SEO specialist.
Write one concise alt text.

RULES:
1. Alt text must be 12–22 words.
2. Describe the visible hairstyle simply and accurately.
3. Include the main hairstyle keyword once if natural.
4. No CTA.
5. No promotional language.
6. No hashtags.
7. No emoji.
8. Do not invent details not clearly shown or stated.

OUTPUT FORMAT:
Return ONLY the plain alt text.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      return result.trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      console.error('Failed to improve alt text via AI:', e);
      return `${input.topic || input.boardName || 'Layered'} hair with natural movement, soft indoor lighting`;
    }
  }

  public async generateKeywords(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest keyword research expert for the hair styling niche. Generate 15 relevant Pinterest search keywords.

RULES:
1. Mix of SHORT-TAIL, MID-TAIL, and LONG-TAIL keywords.
2. Include board niche keywords.
3. Include action-intent keywords (how to, step by step).
4. Include audience-specific variations (for fine hair, for round faces, over 50).
5. All keywords must be hair-specific.
6. Return ONLY a raw JSON array of strings. No markdown, no labels.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate keywords via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'layered hair';
      return [
        base, `${base} ideas`, `${base} tutorial`, `${base} for fine hair`,
        `${base} for round face`, `how to style ${base}`, `${base} over 50`,
        `${base} for thick hair`, `${base} face framing`, `${base} short`,
        `${base} long`, `${base} salon cut`, `${base} technique`, `${base} 2026`, `${base} inspo`
      ];
    }
  }

  public async validatePinMetadata(input: AIInput): Promise<{ isValid: boolean; warnings: string[] }> {
    const system = `You are a Pinterest SEO auditor. Analyze this pin's metadata and identify specific issues.

CHECK ALL:
1. TITLE: 45–85 chars, no emoji, no pipe symbols, no banned spam words, natural keyword usage.
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
    const system = `You are an elite Pinterest SEO copywriter for the hairstyle niche.

TITLE:
- 45–85 characters
- no emoji
- no hashtags
- no pipe symbols
- natural, searchable, human-written
- include hairstyle name clearly
- no spam words

DESCRIPTION:
- 220–380 characters
- no emoji
- no hashtags
- use 2–4 relevant SEO terms naturally
- describe only the visible or provided hairstyle
- end with a soft CTA
- complete final sentence

ALT TEXT:
- 12–22 words
- clear visual description only
- no CTA
- no promotional language

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
      const kw = input.keyword || input.topic || input.boardName || 'layered hair';
      const board = input.boardName || input.topic || 'hair styling';
      return {
        title: `${kw} On Wavy Hair With Face-Framing Layers`,
        description: `${kw} creates soft movement and dimension that works well with natural texture. The cut is lightweight through the ends with soft shaping. Save this pin for your next hairstyle idea.`,
        altText: `Person with a ${kw} hairstyle featuring face-framing layers and natural movement.`
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

    // ── PRIMARY: Load from local project file (not Hermes) ──
    const localPaths = [
      LOCAL_CF_ACCOUNTS_PATH,
      path.join(__dirname, '..', '..', 'cloudflare_working_accounts.txt'),
      'c:\\Users\\jibra\\Desktop\\1\\hermes agent\\cloudflare_working_accounts.txt' // fallback
    ];
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
        if (!model || model === 'opencode-big-pickle') model = '@cf/moonshotai/kimi-k2.6'; // User preference: Kimi is 100% working
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
      model = '@cf/moonshotai/kimi-k2.6'; // User preference: Kimi is 100% working
    }

    const workingPool = await this.syncCloudflareKeysPool().catch(() => [] as { accountId: string; token: string }[]);
    if (workingPool.length === 0) throw new Error('No Cloudflare AI keys found. Please add keys to cloudflare_working_accounts.txt.');

    let mimeType = 'image/jpeg';
    let base64Image = '';

    if (!hasPrompt) {
      if (!fs.existsSync(imagePath))  throw new Error(`Image file not found: ${imagePath}`);
      // Resize image for fast API response
      const image = nativeImage.createFromPath(imagePath);
      const size  = image.getSize();
      let resized = image;
      if (size.width > 800 || size.height > 800) {
        const scale = 800 / Math.max(size.width, size.height);
        resized = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
      }
      base64Image = resized.toJPEG(75).toString('base64');
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
      const tid  = setTimeout(() => ctrl.abort(), 30000); // 30s hard timeout per racer
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

    // Optimized Cloudflare racing: tries 1 round-robin account first (saving CPU/API quota), 
    // and falls back to racing 5 accounts in parallel if that fails.
    const raceCloudflare = async (
      buildRequest: (cred: { accountId: string; token: string }) => { url: string; body: any },
      _hardTimeoutMs: number  // kept for API compat, individual timeout is 30s
    ): Promise<string> => {
      if (workingPool.length === 0) throw new Error('No Cloudflare accounts available.');

      // Try 1 account round-robin first to prevent concurrent bulk rate-limits
      const firstCred = pickCredsRoundRobin(1);
      if (firstCred.length > 0) {
        try {
          const result = await makeAttempt(firstCred[0], buildRequest(firstCred[0]));
          return result;
        } catch (err: any) {
          console.warn(`[CF Race] First single attempt failed: ${err.message}. Falling back to parallel racing...`);
        }
      }

      // Fallback: Race 5 simultaneously for maximum reliability if first attempt fails
      const RACE_SIZE = Math.min(5, workingPool.length);
      const remainingPool = workingPool.filter(c => !firstCred.some(fc => fc.token === c.token));
      const maxWaves = Math.ceil(remainingPool.length / RACE_SIZE);
      
      for (let wave = 0; wave < maxWaves; wave++) {
        // Pick unique credentials from the remaining pool
        const creds = [];
        const poolLen = remainingPool.length;
        if (poolLen > 0) {
          for (let i = 0; i < RACE_SIZE && i < poolLen; i++) {
            creds.push(remainingPool[(_globalCfRoundRobinIndex + i) % poolLen]);
          }
          _globalCfRoundRobinIndex = (_globalCfRoundRobinIndex + RACE_SIZE) % poolLen;
        }

        if (creds.length === 0) break;
        console.log(`[CF Race] Wave ${wave + 1}/${maxWaves} (Fallback): racing ${creds.length} accounts in parallel...`);
        try {
          const result = await Promise.any(
            creds.map(cred => makeAttempt(cred, buildRequest(cred)))
          );
          return result;
        } catch (aggErr: any) {
          console.warn(`[CF Race] Wave ${wave + 1} fallback failed. Trying next wave...`);
        }
      }
      throw new Error('raceCloudflare: all waves exhausted — no Cloudflare account responded.');
    };

    const extractJSON = (raw: string): any => {
      // Strip thinking/reasoning blocks that reasoning models output
      let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = s.indexOf('{');
      if (start > 0) s = s.slice(start);
      const end   = s.lastIndexOf('}');
      if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);
      return JSON.parse(s);
    };

    // ══════════════════════════════════════════════════════
    // STAGE 1 — VISION ANALYSIS (Llama 4 Scout, 8s limit)
    // ══════════════════════════════════════════════════════
    const visionPrompt = `You are a highly accurate visual content analyst for Pinterest hair content.

Examine the image carefully and extract ONLY what is truly visible.
Do not guess. Do not invent. If unclear, write "unclear".

Focus on: hairstyle type, haircut, hair length, hair color, hair texture, bangs/fringe, layers, braids, curls, waves, updo, bun, ponytail, bob, pixie, afro, twists, locs, wolf cut, protective styles, styling finish, face-framing details, setting, lighting.

CRITICAL RULES:
- Describe ONLY what is visible.
- Do NOT assume age, ethnicity, identity, or profession.
- Do NOT invent hairstyles not visible in the image.
- If image shows braids, do NOT claim bangs.
- If image shows a bun, do NOT claim long layered hair unless clearly visible.
- If the image shows a mirror selfie where haircut is unclear, say so in imageQualityNotes.

Return ONLY raw JSON, no markdown, no code blocks:
{"primarySubject":"","visibleHairStyle":"","hairLength":"short|medium|long|unclear","hairColor":"","hairTexture":"straight|wavy|curly|coily|braided|mixed|unclear","visibleDetails":[],"bangsVisible":false,"bangsType":"wispy bangs|curtain bangs|blunt bangs|side bangs|none|unclear","layersVisible":false,"protectiveStyleVisible":false,"faceShapeSignals":"unclear","photoSetting":"indoor|outdoor|salon|studio|street|home|unclear","lighting":"natural light|soft indoor light|studio light|mixed|unclear","poseOrFraming":"front view|side view|seated portrait|close-up|half-body|mirror selfie|unclear","overallAesthetic":"","imageQualityNotes":"","confidence":0.0}`;

    let visionJSON: any = null;

    // ══════════════════════════════════════════════════════
    // STAGE 1 — skipped when imagePrompt is provided
    // ══════════════════════════════════════════════════════
    if (hasPrompt) {
      // Build synthetic visionJSON from prompt so mismatch/fallback helpers still work
      const HAIR_TERMS_P = /\b(blonde|brunette|dark|black|red|auburn|curly|wavy|straight|short|long|medium|bangs|curtain bangs|wispy bangs|layers|layered|bun|ponytail|braid|braids|braided|natural|coily|afro|highlights|balayage|ombre|pixie|bob|shag|fringe|lob|blowout|textured|sleek|voluminous|wolf cut|freehand|cornrow|zigzag|side part|twist|locs|protective|crochet)\b/gi;
      const rawPromptWords = cleanPrompt.match(HAIR_TERMS_P) || [];
      const promptWords = Array.from(new Set(rawPromptWords.map(w => w.toLowerCase())));
      visionJSON = {
        visibleHairStyle:       promptWords.slice(0, 4).join(' ') || cleanPrompt.slice(0, 40),
        hairLength:             /\bshort\b/.test(cleanPrompt) ? 'short' : /\blong\b/.test(cleanPrompt) ? 'long' : 'unclear',
        hairColor:              promptWords.find((w: string) => /blonde|brunette|dark|black|red|auburn/.test(w)) || 'unclear',
        hairTexture:            promptWords.find((w: string) => /curly|wavy|straight|coily|braided|textured/.test(w)) || 'unclear',
        visibleDetails:         promptWords.slice(0, 5),
        bangsVisible:           /bangs|fringe|wispy/.test(cleanPrompt.toLowerCase()),
        bangsType:              /wispy/.test(cleanPrompt) ? 'wispy bangs' : /curtain/.test(cleanPrompt) ? 'curtain bangs' : 'unclear',
        layersVisible:          /layer/.test(cleanPrompt.toLowerCase()),
        protectiveStyleVisible: /braid|cornrow|afro|locs|twist|freehand|zigzag|crochet/.test(cleanPrompt.toLowerCase()),
        faceShapeSignals:       'unclear',
        photoSetting:           'unclear',
        lighting:               'unclear',
        poseOrFraming:          'unclear',
        imageQualityNotes:      'Derived from image generation prompt',
        confidence:             0.7
      };
      console.log(`[Stage 1 Skipped] Prompt-derived vision: style="${visionJSON.visibleHairStyle}", texture="${visionJSON.hairTexture}"`);
    } else {
      // Standard vision path (Llama 3.2 Vision)
      try {
        const makeVisionCall = async () => {
          return await raceCloudflare(
            (cred) => ({
              url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
              body: {
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text',      text: visionPrompt },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                  ]
                }]
              }
            }),
            12000
          );
        };

        let visionRaw = '';
        try {
          visionRaw = await makeVisionCall();
        } catch (visionErr: any) {
          if (visionErr.message && visionErr.message.includes("must submit the prompt 'agree'")) {
            console.warn('[Stage 1 Vision] License agreement required. Auto-submitting agreement...');
            // Agree using prompt: 'agree' for the working pool accounts
            await raceCloudflare(
              (cred) => ({
                url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
                body: { prompt: 'agree' }
              }),
              8000
            ).catch(() => {});
            
            // Retry the vision call
            console.log('[Stage 1 Vision] Retrying vision call post-agreement...');
            visionRaw = await makeVisionCall();
          } else {
            throw visionErr;
          }
        }
        visionJSON = extractJSON(visionRaw);
        console.log(`[Stage 1 Vision] OK — style: "${visionJSON.visibleHairStyle}", color: "${visionJSON.hairColor}", confidence: ${visionJSON.confidence}`);
      } catch (e) {
        console.warn('[Stage 1 Vision] Failed — building fallback vision from filename:', e);
        const HAIR_TERMS = /\b(blonde|brunette|dark|black|red|auburn|curly|wavy|straight|short|long|medium|bangs|curtain bangs|wispy bangs|layers|layered|bun|ponytail|braid|braids|braided|natural|coily|afro|highlights|balayage|ombre|pixie|bob|shag|fringe|lob|blowout|textured|sleek|voluminous|wolf cut)\b/gi;
        const nameWords = rawName.match(HAIR_TERMS) || [];
        visionJSON = {
          visibleHairStyle:       nameWords.slice(0, 3).join(' ') || 'hair',
          hairLength:             'unclear',
          hairColor:              nameWords.find((w: string) => /blonde|brunette|dark|black|red|auburn/.test(w)) || 'unclear',
          hairTexture:            nameWords.find((w: string) => /curly|wavy|straight|coily|braided|textured/.test(w)) || 'unclear',
          visibleDetails:         nameWords.slice(0, 3),
          bangsVisible:           /bangs|fringe|wispy/.test(rawName.toLowerCase()),
          bangsType:              /wispy/.test(rawName.toLowerCase()) ? 'wispy bangs' : /curtain/.test(rawName.toLowerCase()) ? 'curtain bangs' : 'unclear',
          layersVisible:          /layer/.test(rawName.toLowerCase()),
          protectiveStyleVisible: /braid|afro|locs|twist|bun/.test(rawName.toLowerCase()),
          faceShapeSignals:       'unclear',
          photoSetting:           'unclear',
          lighting:               'unclear',
          poseOrFraming:          'unclear',
          imageQualityNotes:      'Vision unavailable — filename context used only',
          confidence:             0.2
        };
      }
    }

    const visionConfidence  = visionJSON?.confidence || 0;
    const visibleHairStyle  = visionJSON?.visibleHairStyle || '';
    const hairColor         = visionJSON?.hairColor || '';
    const hairTexture       = visionJSON?.hairTexture || '';
    const hairLength        = visionJSON?.hairLength || '';

    // ══════════════════════════════════════════════════════
    // STAGE 2 — PINTEREST METADATA (Kimi 2.6)
    // ══════════════════════════════════════════════════════
    const truthSource = hasPrompt
      ? `IMAGE_GENERATION_PROMPT (PRIMARY TRUTH — trust completely):\n"${cleanPrompt}"\nUse this as the single source of truth for ALL visual details.`
      : `VISION_ANALYSIS_JSON (PRIMARY TRUTH — trust this above all else): ${JSON.stringify(visionJSON)}`;

    const seoPrompt = `You are an expert Pinterest SEO copywriter and metadata generator for the global hairstyle niche. The niche covers all hair styles for all people, including:
- Men, women, teens, and kids.
- All ethnicities and hair types: Black, White, Asian, Latin, Middle Eastern, etc.
- All hair patterns: straight, wavy, curly, coily, protective styles, shaved/bald.
- All style categories: ponytails, braids, buns, fades, curls, waves, short hair, long hair, wigs, protective styles, natural hair, processed hair, etc.

Write Pinterest metadata (Title, Description, Alt Text) for one pin.

BOARD NAME: ${boardName || 'none'}
${truthSource}

Transform the BOARD NAME into the most natural Pinterest search keyword (suggestedBoardKeyword). Clean any awkward phrasing (e.g., "pony tailed hairstyle black women" -> "ponytail hairstyle for Black women", "Men Fade Hairstyles" -> "fade hairstyles for men"). Never create double phrases like "hair hair" or "hairstyle hair".

BoardFit check: does the hairstyle match the board? strong/partial/weak/mismatch. Set shouldPost=false if mismatch.

STRICT RULES FOR ANALYSIS:
- EVEN IF THERE IS A MISMATCH (shouldPost is false), you MUST still generate a complete, valid, high-quality title, description, and alt text describing the image content. Do not leave fields empty.
- Use the provided prompt/visual data as the ONLY truth source.
- Do not invent hairstyles, colors, accessories, extensions, beads, cuffs, outfit details, background details, age, or styling features unless clearly mentioned.
- Do not keyword-stuff.
- Do not mention "AI image", "prompt", "generated", or "Pinterest board".
- Avoid spammy adjectives (stunning, amazing, perfect, viral, trending, obsession, must-have, hair goals). Replace with neutral alternatives (great, ideal, stylish, modern, classic).

INCLUSIVE & ETHICAL LANGUAGE:
- Use neutral, inclusive language by default (e.g., "women," "men," "people," or "someone with [hair type]").
- Do not assume ethnicity, skin tone, or gender unless explicitly stated in the source data.
- Only mention ethnicity or race (e.g., Black, White, Asian, Latin) if clearly implied or stated. Capitalize "Black" when referring to people.
- Never identify or speculate about a real person's identity. Avoid health, race, religion, political or sensitive inferences unless explicit.

TITLE (55–80 characters):
- Natural Pinterest search query, not a sentence. Use Title Case (clean title case).
- Write between 55 and 80 characters to ensure it meets minimum length rules.
- CRITICAL: Front-load the strongest keyword in the first 30 characters when possible.
- Include the hairstyle name clearly.
- STRICTLY FORBIDDEN IN TITLES: pipe symbols ("|"), plus symbols ("+"), emojis, and hashtags. Any title containing these characters is invalid.
- Make the title natural, searchable, and human-written. Ensure variety if doing multiple prompts.

DESCRIPTION (260–360 characters):
- MUST be strictly between 260 and 360 characters (final written length must be within this range to prevent being too short).
- MUST be exactly 3 to 4 sentences in total and must end with a complete sentence.
- NEVER start the description with the following forbidden words: "Discover", "Achieve", "Get inspired", "Check out", or "Looking for". Start directly with the hairstyle name or a natural keyword.
- Emojis and hashtags are strictly prohibited in the description. Do not output them.
- Describe exactly what the prompt shows. Do not use incorrect category terms.
- Include 2-4 useful relevant SEO terms naturally (e.g., natural hair, protective style, sleek edges, cornrows, curls, ponytail, bun, braids, short hair, long hair, wigs, fade, waves, coily, straight hair, kids hairstyles, men's hairstyles, easy hairstyle, salon-ready).
- Include ONE soft Call-to-Action (CTA) at the end. Example variations to use: "Save this pin for your next hairstyle idea.", "Pin this look for your next hair appointment.", "Tap the link for step-by-step styling tips.", "Save this style for your next protective hairstyle.", "Reference this before your next barber or stylist visit."

ALT TEXT (15–22 words):
- Simple, literal visual sentence describing the visible hairstyle simply and accessibly.
- MUST contain between 15 and 22 words (do not write shorter than 15 words). To meet this length, describe the texture, color, cut, and background setting explicitly.
- Include the main hairstyle keyword once if natural.
- No hashtags, no CTA, no promotional words, no emojis, no grammar mistakes.
- If gender or ethnicity is clear (e.g., "Black woman," "Asian man," "young girl"), mention it naturally. If not specified, use neutral phrasing (e.g., "person with short curly hair").

Return ONLY raw JSON matching this schema:
{"suggestedBoardKeyword":"","boardFit":"strong","shouldPost":true,"boardFitReason":"","mismatchWarning":"","title":"","description":"","altText":""}`;


    try {
      const seoRaw = await raceCloudflare(
        (cred) => ({
          url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${model}`,
          body: { 
            messages: [{ role: 'user', content: model.includes('kimi') ? `${seoPrompt}\nCRITICAL: Keep your reasoning/thought process extremely brief (under 100 words) so you do not exceed the Cloudflare output token budget.` : seoPrompt }], 
            temperature: 0.7, 
            max_tokens: model.includes('kimi') ? 4000 : 2500 
          }
        }),
        45000  // 45s — reasoning models take 10-15s typically
      );

      const parsed = extractJSON(seoRaw);
      if (!parsed.title || !parsed.description) throw new Error('Incomplete Stage 2 response');

      // Post-process to clean any remaining noise
      const cleanedTitle       = cleanText(parsed.title || '');
      const cleanedDescription = cleanText(parsed.description || '');
      const cleanedAlt         = cleanText(parsed.altText || '');

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
      const MAX_RETRIES = 5;

      // ── AUTO-RETRY if audit score < 70 ─────────────────────
      while (audit.score < 70 && retryCount < MAX_RETRIES) {
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
                messages: [{ role: 'user', content: model.includes('kimi') ? `${retryPrompt}\nCRITICAL: Keep your reasoning/thought process extremely brief (under 100 words) so you do not exceed the Cloudflare output token budget.` : retryPrompt }], 
                temperature: 0.8, 
                max_tokens: model.includes('kimi') ? 4000 : 2500 
              }
            }),
            45000
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
