import { DbManager } from '../database/db';
import * as fs from 'fs';
import * as path from 'path';
import { nativeImage } from 'electron';

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

  // ─ 1. Forbidden patterns in title ─
  const FORBIDDEN = [
    'hair styling hair', 'hairstyle hair', 'hair hair',
    ' + ', 'for hair styling hair', '+ cute', 'hair idea for',
    'amazing hair', 'beautiful hair ideas', 'hair goals'
  ];
  for (const f of FORBIDDEN) {
    if (tl.includes(f)) { issues.push(`Title has forbidden phrase: "${f}"`); score -= 20; }
  }

  // ─ 2. Title length ─
  if (title.length < 25) { issues.push('Title too short (< 25 chars)'); score -= 15; }
  if (title.length > 100) { issues.push('Title too long (> 100 chars)'); score -= 10; }

  // ─ 3. Board keyword relevance ─
  const boardWords = boardName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const matchedBoardWords = boardWords.filter(w => tl.includes(w));
  if (boardWords.length > 0 && matchedBoardWords.length === 0) {
    issues.push(`Board keyword not reflected in title (board: "${boardName}")`); score -= 20;
  }

  // ─ 4. Prompt accuracy ─
  if (imagePrompt && imagePrompt.length > 10) {
    const promptKeywords = imagePrompt.toLowerCase().match(/\b(curly|wavy|straight|braids?|cornrow|freehand|natural|loc|twist|afro|blonde|brunette|dark|short|long|medium|pixie|bob|bangs|layers?|protective|crochet|zigzag|wolf cut|shag)\b/g) || [];
    const matchedPromptWords = promptKeywords.filter(k => tl.includes(k) || dl.includes(k));
    if (promptKeywords.length > 0 && matchedPromptWords.length === 0) {
      issues.push('Output does not reflect key terms from the generation prompt'); score -= 25;
    }
  }

  // ─ 5. Description generic phrases ─
  const GENERIC_DESC = [
    'clean, natural finish', 'frames the face well', 'Great for all lengths',
    'Works on every face shape', 'the layers sit lightly', 'layers catch the light',
    'perfect for any occasion', 'Explore more stunning styles',
    // Llama-specific filler phrases detected in benchmark
    'elevate your look', 'elevate your braided', 'elevate your natural',
    'elevate your wavy', 'get inspired by this stunning', 'inspired by this stunning',
  ];
  for (const g of GENERIC_DESC) {
    if (description.toLowerCase().includes(g.toLowerCase())) { issues.push(`Generic filler in description: "${g}"`); score -= 10; }
  }

  // ─ 6. Description length ─
  if (description.length < 80)  { issues.push('Description too short (< 80 chars)'); score -= 15; }
  if (description.length > 500) { issues.push('Description too long (> 500 chars)'); score -= 5; }

  // ─ 7. Title starts with a hairstyle keyword (good SEO) ─
  const SEO_STARTERS = /^(how to|the |a |an |best |top |easy |perfect |stunning |gorgeous |beautiful )/i;
  if (!SEO_STARTERS.test(title) && !boardWords.some(w => tl.startsWith(w))) {
    // Not a hard failure, just note it
  }

  // ─ 8. Alt text must not repeat board keyword stuffing ─
  const altWordCount = altText.split(/\s+/).length;
  if (altWordCount > 25) { issues.push('Alt text too verbose (> 25 words)'); score -= 5; }

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
const LOCAL_CF_STATUS_PATH = path.join(_PROJECT_ROOT, 'cloudflare_status.json');
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
  if (title.includes('+')) return 'Title contains "+"';
  if (/hair styling hair/i.test(title)) return 'Title contains "hair styling hair"';
  if (/hairstyle hair/i.test(title)) return 'Title contains "hairstyle hair"';
  if (/\bhair hair\b/i.test(title)) return 'Title contains repeated "hair hair"';
  
  // Check for consecutive duplicate words (e.g., "braided braided")
  const dupTitleMatch = /\b([a-z]+)\s+\1\b/i.exec(title);
  if (dupTitleMatch) return `Title contains consecutive duplicate word: "${dupTitleMatch[0]}"`;

  if (title.length < 30) return `Title too short (${title.length} chars)`;
  if (title.length > 100) return `Title too long (${title.length} chars)`;
  const badPhrases = ['beautiful', 'amazing', 'perfect', 'stunning', 'vibes ✨', 'look ✨', 'that actually works'];
  for (const p of badPhrases) {
    if (title.toLowerCase().includes(p)) return `Title contains spam phrase: "${p}"`;
  }
  return null; // Valid
}

/** Check whether description makes false layer claims */
function validateDescription(description: string, visionJSON: any): string | null {
  if (!description) return 'Description is empty';
  if (description.length < 200) return `Description too short (${description.length} chars)`;
  
  // Check for consecutive duplicate words (e.g., "braided braided", "braids braids")
  const dupDescMatch = /\b([a-z]+)\s+\1\b/i.exec(description);
  if (dupDescMatch) return `Description contains consecutive duplicate word: "${dupDescMatch[0]}"`;

  const hasLayerClaims = /\blayers?\b|face-framing layers|lightweight layer/i.test(description);
  if (hasLayerClaims && visionJSON?.layersVisible === false && (visionJSON?.confidence || 0) > 0.5) {
    return 'Description claims layers but visionJSON.layersVisible is false';
  }
  const genericSpam = [
    'bob to waist-length', 'bob to waist length', 'grows out beautifully',
    // Llama-specific filler phrases
    'elevate your look', 'elevate your braided', 'elevate your natural',
    'get inspired by this stunning', 'inspired by this stunning',
  ];
  for (const p of genericSpam) {
    if (description.toLowerCase().includes(p)) return `Description contains generic filler: "${p}"`;
  }
  const badHashtags = ['#Hair', '#Beauty', '#PinterestFinds', '#Inspiration', '#HairStyle'];
  for (const h of badHashtags) {
    if (description.includes(h)) return `Description uses banned hashtag: ${h}`;
  }
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
  const setting       = cleanHairPhrase(visionJSON?.photoSetting || '');
  const settingStr    = setting && setting !== 'unclear' ? setting : 'indoors';
  const layersVisible = visionJSON?.layersVisible === true;
  const bangsVisible  = visionJSON?.bangsVisible === true;
  const texture       = cleanHairPhrase(visionJSON?.hairTexture || '');
  const hairStyle     = cleanHairPhrase(visionJSON?.visibleHairStyle || '');
  const color         = cleanHairPhrase(visionJSON?.hairColor || '');
  const length        = cleanHairPhrase(visionJSON?.hairLength || '');
  const bdHash        = boardToHashtag(bd);
  const hairHash      = hairDetailToHashtag(hairDetail);

  const isProtective  = visionJSON?.protectiveStyleVisible === true || /braid|twist|locs|loc/.test(hairStyle);
  const isWolfCut     = /wolf cut|wolf/.test(hairStyle);
  const isCurly       = /curly|coily|coils|afro/.test(texture) || /curly|coily|afro/.test(hairStyle);
  const isWavy        = /wavy/.test(texture) || /wavy/.test(hairStyle);
  const isBun         = /bun|updo/.test(hairStyle);
  const isPixie       = /pixie/.test(hairStyle);
  const isBob         = /\bbob\b/.test(hairStyle);
  const hasBangs      = bangsVisible || /bangs|fringe|wispy/.test(hairStyle);

  if (isProtective) {
    return {
      title:       `${bd} with braided ${color || 'dark'} hair 🖤`.slice(0, 100),
      description: `${hairDetail} is styled in a braided protective look with natural texture. This is a strong idea for ${bd}, keeping the hair protected and low-maintenance. The braid pattern sits cleanly and suits most face shapes. Pin this for your next hair idea! ${bdHash} #BraidedHair #ProtectiveStyle #NaturalHairIdeas ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} in a braided protective style, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isWolfCut) {
    return {
      title:       `Wolf cut for ${length || 'medium'} hair with soft texture 💕`.slice(0, 100),
      description: `${hairDetail} is styled in a wolf cut shape with visible texture and soft movement. This hairstyle works well for ${bd} — shaggy ends and low-maintenance styling. Ask your stylist for light shaping around the front and natural volume through the crown. Save this for your next salon appointment! ${bdHash} #WolfCutHair #TexturedHair #SalonIdeas ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} in a wolf cut shape with shaggy texture, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isCurly) {
    return {
      title:       `${bd} on ${hairDetail} with natural volume 🖤`.slice(0, 100),
      description: `${hairDetail} is shown with natural volume and soft curl texture, making it a strong idea for ${bd}. This look works best when the curl pattern is shaped naturally rather than over-layered. Use a light curl cream or leave-in conditioner to keep the texture defined. Save this for your next hair idea! ${bdHash} #CurlyHairIdeas #NaturalTexture #CurlyHairInspo ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} with natural curl volume and soft texture, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isWavy) {
    return {
      title:       `${bd} on ${hairDetail} ✨`.slice(0, 100),
      description: `${hairDetail} is shown with natural wave texture and soft movement. This is a useful idea for ${bd} — the wave pattern adds volume without needing extra products. Ask your stylist for shaping that works with your natural wave instead of against it. Pin this for your next appointment! ${bdHash} #WavyHairIdeas #NaturalWaves #HairInspo ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} with natural wave texture and soft movement, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isBun) {
    return {
      title:       `${bd} with a ${color || 'dark'} updo style 💫`.slice(0, 100),
      description: `${hairDetail} is shown in a clean updo that works well for ${bd}. The style keeps the hair off the face and is easy to recreate on most hair types. Pin this for your next hair idea! ${bdHash} #UpdoHair #EasyUpdo #HairInspo ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} in a clean updo style, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (hasBangs) {
    const bangsType = cleanHairPhrase(visionJSON?.bangsType || 'soft bangs');
    return {
      title:       `${bd} with ${bangsType} on ${length || 'medium'} ${color || 'dark'} hair ✨`.slice(0, 100),
      description: `${hairDetail} is shown with ${bangsType} and a clean hair shape. This is a strong match for ${bd} — the bangs frame the face and add a styled finish without heavy cutting. Ask your stylist for a soft fringe that suits your face shape. Save this for your next appointment! ${bdHash} #BangsHair #SoftFringe #HairInspo ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} with ${bangsType} and a natural shape, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isPixie) {
    return {
      title:       `Pixie cut on ${color || 'dark'} hair for ${bd} 🖤`.slice(0, 100),
      description: `${hairDetail} is shown in a clean pixie cut shape. This is a strong idea for ${bd} — the short length is easy to style and works for most face shapes. Ask your stylist for side texture and a soft neckline. Pin this for your next salon visit! ${bdHash} #PixieCut #ShortHairIdeas #SalonInspo ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} in a clean pixie cut, ${settingStr} lighting`.slice(0, 200)
    };
  }

  if (isBob) {
    return {
      title:       `Bob cut for ${bd} on ${color || 'dark'} hair 💕`.slice(0, 100),
      description: `${hairDetail} is shown in a clean bob shape that works well for ${bd}. The cut frames the face and suits most hair textures. Ask your stylist for a length that hits at the jaw or collar for the best result. Save this for your next salon appointment! ${bdHash} #BobHaircut #HairCutInspo #SalonIdeas ${hairHash}`.slice(0, 500),
      altText:     `${hairDetail} in a clean bob cut, ${settingStr} lighting`.slice(0, 200)
    };
  }

  // Generic fallback — pattern seed based, no generic layer claims
  const generic = [
    {
      title:       `${bd} on ${hairDetail} ✨`.slice(0, 100),
      description: `${hairDetail} is shown with a clean, natural finish that works well for ${bd}. The cut suits the hair texture and requires minimal daily effort. Ask your stylist to customize based on your hair density and face shape. Save this for your next salon visit! ${bdHash} #HairCutInspo ${hairHash} #SalonInspo #HairGoals`.slice(0, 500),
      altText:     `${hairDetail} with a natural finish, ${settingStr} lighting`.slice(0, 200)
    },
    {
      title:       `How to style ${hairDetail} for ${bd} 💫`.slice(0, 100),
      description: `${hairDetail} is a strong match for ${bd} ideas. The look suits most hair types and requires minimal daily effort. Ask your stylist to suggest the right shaping based on your face and hair density. Pin this for your next appointment! ${bdHash} ${hairHash} #HairIdeas #SalonReady #HairCut`.slice(0, 500),
      altText:     `${hairDetail} styled naturally, ${settingStr} lighting`.slice(0, 200)
    },
    {
      title:       `${bd} for ${hairDetail} 🖤`.slice(0, 100),
      description: `${hairDetail} is a useful idea for ${bd}. The natural shape and texture suits everyday styling with minimal products. Show this photo to your stylist before your next salon visit! ${bdHash} ${hairHash} #HairInspo #HairCutIdeas #SalonAppointment`.slice(0, 500),
      altText:     `${hairDetail} in a natural shape, ${settingStr} lighting`.slice(0, 200)
    },
    {
      title:       `${hairDetail} idea for ${bd} 💕`.slice(0, 100),
      description: `${hairDetail} is shown with a clean everyday shape that suits ${bd}. The styling is low-maintenance and works for most hair types. Your stylist can customize the cut to your face shape. Pin it to save for later! ${bdHash} ${hairHash} #EverydayHair #SalonLook #HairGoals`.slice(0, 500),
      altText:     `${hairDetail} with a clean natural shape, ${settingStr} setting`.slice(0, 200)
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

  public async generateTitleSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO expert for the hair styling niche. Generate 5 PERFECT pin titles.

RULES:
1. Front-load primary keyword in first 3-5 words.
2. Title MUST be directly relevant to the board niche.
3. Write as a natural search query.
4. Length: 40-75 characters.
5. 1 relevant emoji placed naturally (✨ 💫 🖤 🤎 💕 🌿).
6. Sentence case only.
7. Each title targets a different angle.
8. Never prefix with numbers.
9. Never use: beautiful, amazing, perfect, stunning, vibes, inspiration, "+" signs.
10. All titles must be hair-specific.

OUTPUT FORMAT: Return ONLY a raw JSON array of 5 strings. No markdown, no labels.`;

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
        `${keyword} on dark wavy hair that frames the face ✨`,
        `How to style ${keyword} at your next salon visit 💫`,
        `${keyword} for round faces and fine hair 🖤`,
        `${keyword} cut with soft face-framing layers ✨`,
        `${keyword} for thick hair that adds natural volume 💕`
      ];
    }
  }

  public async generateDescriptionSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO copywriter for the hair styling niche. Generate 3 PERFECT pin descriptions.

RULES:
1. First sentence MUST start with the primary keyword.
2. Naturally reference the board niche within first 2 sentences.
3. Include 2-3 LSI hair keywords naturally.
4. Length: 350-480 characters.
5. 1-2 emojis placed naturally.
6. End with a clear CTA.
7. End with 3-5 HAIR-SPECIFIC hashtags.
8. NEVER start with: Discover, Check out, Looking for, Are you.
9. NEVER use: trending on Pinterest right now, this pin has everything you need, new obsession, unmatched, takes the look to another level.
10. Write like a recommendation from a knowledgeable friend.

OUTPUT FORMAT: Return ONLY a raw JSON array of 3 strings. No markdown, no labels.`;

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
        `${kw} creates soft movement and dimension that works on every face shape ✨ Ask your stylist for face-framing pieces with lightweight ends. Save this for your next salon visit! #${kw.replace(/\s+/g, '')} #LayeredHair #SalonInspo #FaceFramingLayers #HairGoals`,
        `${kw} gives a clean finish that suits oval, round, and heart face shapes 💫 Ask for soft shaping through the mid-lengths and shorter pieces around the face. Pin this for your mood board! #${kw.replace(/\s+/g, '')} #HairInspo #SalonReady #HairCut`,
        `${kw} works with fine, thick, and curly hair — minimal heat required once the cut settles 🖤 Show your stylist this photo at your next appointment! #${kw.replace(/\s+/g, '')} #${board.replace(/\s+/g, '')} #HairTexture #SalonAppointment`
      ];
    }
  }

  public async improveAltText(input: AIInput): Promise<string> {
    const system = `You are an accessibility and SEO specialist for Pinterest. Write a concise, descriptive image alt text.

RULES:
1. Describe the ACTUAL VISUAL CONTENT: hair color, style, length, texture, setting.
2. Include the primary keyword ONCE naturally.
3. Keep it 80-150 characters.
4. Useful for blind users.
5. Do NOT use "Image of", "Picture of", "Photo of".
6. No keyword stuffing.
Output ONLY the plain alt text. No quotes, no labels, no formatting.`;

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
1. TITLE: 40-75 chars? Front-loads keyword in first 5 words? Has 1 emoji? Hair-relevant? No "+" signs?
2. DESCRIPTION: 350-480 chars? Starts with keyword? Has CTA? Has 3-5 niche hashtags?
3. SEMANTIC MATCH: Is title+description relevant to the board?
4. SPAM CHECK: Contains "trending on Pinterest", "new obsession", generic phrases?

Return a JSON object: {"isValid": boolean, "warnings": ["actionable warning"]}
Each warning must say EXACTLY what to fix and HOW.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      const warnings: string[] = [];
      if (!input.title || input.title.length < 10) warnings.push('Title too short. Write 40-75 characters with primary keyword in first 5 words.');
      if (input.title && input.title.length > 85) warnings.push('Title exceeds 85 characters. Reduce to 75 chars max.');
      if (!input.description || input.description.length < 150) warnings.push('Description too short. Write 350-480 characters starting with your primary keyword.');
      if (input.description && !input.description.includes('#')) warnings.push('Missing hashtags. Add 3-5 hair-specific hashtags at the end.');
      if (!input.destinationUrl || !input.destinationUrl.startsWith('http')) warnings.push('Destination URL missing. Add a valid https:// URL.');
      const emojiCount = (input.title || '').match(/\p{Emoji}/gu)?.length || 0;
      if (emojiCount === 0) warnings.push('No emoji in title. Add 1 relevant emoji to improve click-through rate.');
      return { isValid: warnings.length === 0, warnings };
    }
  }

  public async generateSEOComplete(input: AIInput): Promise<{ title: string; description: string; altText: string }> {
    const system = `You are an elite Pinterest SEO expert for the hair styling niche.

TITLE: 40-75 chars, front-load keyword, 1 emoji, sentence case, search-query style. No "+" signs.
DESCRIPTION: 350-480 chars, start with keyword, 2-3 LSI hair keywords, 1-2 emojis, CTA, 3-5 hair-specific hashtags.
  NEVER use: "trending on Pinterest right now", "new obsession", "unmatched", "takes the look to another level".
ALT TEXT: 80-150 chars, describe the visible hairstyle precisely, keyword once naturally.

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
        title: `${kw} on wavy hair with face-framing layers ✨`,
        description: `${kw} creates soft movement and dimension that works on every hair type. The cut is lightweight through the ends 🌿 Ask your stylist for face-framing pieces with soft shaping through the mid-lengths. Save this for your next salon appointment! #${kw.replace(/\s+/g, '')} #${board.replace(/\s+/g, '')} #LayeredHair #FaceFramingLayers #SalonInspo`,
        altText: `${kw} hairstyle with face-framing layers and natural movement, soft indoor lighting`
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
        if (!model || model === 'opencode-big-pickle') model = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'; // Benchmarked: top-tier search titles & SEO quality
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

    // ── RACE_SIZE accounts in parallel — first success wins ─────────────────────
    // Falls back to sequential waves if a whole wave fails.
    const RACE_SIZE = Math.min(5, workingPool.length); // Race 5 simultaneously
    const raceCloudflare = async (
      buildRequest: (cred: { accountId: string; token: string }) => { url: string; body: any },
      _hardTimeoutMs: number  // kept for API compat, individual timeout is 30s
    ): Promise<string> => {
      if (workingPool.length === 0) throw new Error('No Cloudflare accounts available.');

      const maxWaves = Math.ceil(workingPool.length / RACE_SIZE);
      for (let wave = 0; wave < maxWaves; wave++) {
        const creds = pickCredsRoundRobin(RACE_SIZE);
        if (creds.length === 0) break;
        console.log(`[CF Race] Wave ${wave + 1}/${maxWaves}: racing ${creds.length} accounts in parallel...`);
        try {
          // Promise.any resolves as soon as the FIRST promise resolves
          const result = await Promise.any(
            creds.map(cred => makeAttempt(cred, buildRequest(cred)))
          );
          return result;
        } catch (aggErr: any) {
          // AggregateError means ALL racers in this wave failed — try next wave
          console.warn(`[CF Race] Wave ${wave + 1} all failed. Trying next wave...`);
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
        hairLength:             /\bshort\b/.test(cleanPrompt) ? 'short' : /\blong\b/.test(cleanPrompt) ? 'long' : 'medium',
        hairColor:              promptWords.find((w: string) => /blonde|brunette|dark|black|red|auburn/.test(w)) || 'dark',
        hairTexture:            promptWords.find((w: string) => /curly|wavy|straight|coily|braided|textured/.test(w)) || 'natural',
        visibleDetails:         promptWords.slice(0, 5),
        bangsVisible:           /bangs|fringe|wispy/.test(cleanPrompt.toLowerCase()),
        bangsType:              /wispy/.test(cleanPrompt) ? 'wispy bangs' : /curtain/.test(cleanPrompt) ? 'curtain bangs' : 'none',
        layersVisible:          /layer/.test(cleanPrompt.toLowerCase()),
        protectiveStyleVisible: /braid|cornrow|afro|locs|twist|freehand|zigzag|crochet/.test(cleanPrompt.toLowerCase()),
        faceShapeSignals:       'unclear',
        photoSetting:           'indoor',
        lighting:               'soft indoor light',
        poseOrFraming:          'front view',
        imageQualityNotes:      'Derived from image generation prompt — high confidence',
        confidence:             0.95
      };
      console.log(`[Stage 1 Skipped] Prompt-derived vision: style="${visionJSON.visibleHairStyle}", texture="${visionJSON.hairTexture}"`);
    } else {
      // Standard vision path (Llama 4 Scout)
      try {
        const visionRaw = await raceCloudflare(
          (cred) => ({
            url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
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
          8000
        );
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

    const seoPrompt = `You are a Pinterest SEO specialist for hair content. Write metadata for a pin.

BOARD: ${boardName || 'none'}
${truthSource}

Transform BOARD into the most natural Pinterest search keyword (suggestedBoardKeyword). Clean awkward phrasing. Never create "hair hair", "hairstyle hair", or "hair styling hair".

BoardFit check: does the hairstyle match the board? strong/partial/weak/mismatch. Set shouldPost=false if mismatch.

TITLE (40-100 chars):
- Natural Pinterest search query, not a sentence.
- CRITICAL: Frontload the main search keyword or board keyword in the FIRST 30 characters (since Pinterest truncates grid previews).
- If boardFit strong/partial: include board keyword naturally.
- If boardFit weak/mismatch: write accurate to image only, no board keyword.
- At least 1 specific visual detail (color, texture, style).
- Sentence case, 0-1 emoji, NO "+", NO "hair hair", NO "hairstyle hair".
- NEVER paste board name verbatim if it sounds robotic.
- Pattern: ${ patternSeed === 0 ? 'How-to angle' : patternSeed === 1 ? 'Feature angle' : patternSeed === 2 ? 'Benefit angle' : 'Direct style name angle' }

DESCRIPTION (150-400 chars):
- CRITICAL: Open with a highly engaging first sentence that directly includes the primary search keyword and hairstyle.
- Describe the exact hairstyle details and styling notes.
- Do NOT claim layers, bangs, face-shape benefits unless confirmed in vision data.
- Include 2-3 natural LSI search phrases. Do NOT stuff keywords.
- Include a strong, helpful call-to-action (e.g. "Save this pin for inspiration", "Tap to see the full look").
- Avoid generic filler phrases like "clean natural finish", "frames the face", "works every face shape".
- Do NOT use excessive hashtags (maximum 0-2 highly relevant tags, focusing instead on natural sentences).

ALT TEXT (max 20 words): 1 literal sentence, no hashtags, no CTA.

Return ONLY raw JSON:
{"suggestedBoardKeyword":"","boardFit":"strong","shouldPost":true,"boardFitReason":"","mismatchWarning":"","title":"","description":"","altText":""}`;


    try {
      const seoRaw = await raceCloudflare(
        (cred) => ({
          url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`,
          body: { messages: [{ role: 'user', content: seoPrompt }], temperature: 0.7, max_tokens: 2500 }
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
              url:  `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`,
              body: { messages: [{ role: 'user', content: retryPrompt }], temperature: 0.8, max_tokens: 2500 }
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

      return {
        title:                finalTitle.slice(0, 100),
        description:          finalDescription.slice(0, 500),
        altText:              finalAlt.slice(0, 200),
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
        auditIssues:  audit.issues,
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

    return {
      title:                fallbackTitle.slice(0, 100),
      description:          fallbackDesc.slice(0, 500),
      altText:              cleanText(fallback.altText).slice(0, 200),
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
      auditIssues:  ['Fallback metadata used — Stage 2 AI failed or was rejected'],
      auditRetried: false
    };
  }
}
