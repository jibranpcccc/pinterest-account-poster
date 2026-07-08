import os

file_path = "electron/ai/openCodeProvider.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. ADD CONSTANTS AND HELPERS
constants = """
const PINTEREST_RULES = {
  titleMin: 45,
  titleMax: 85,
  descriptionMin: 220,
  descriptionMax: 380,
  altMinWords: 12,
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
  return (text || '').trim().split(/\\s+/).filter(Boolean).length;
}

function hasCompleteSentence(text: string): boolean {
  return /[.!?]$/.test((text || '').trim());
}

function containsEmoji(text: string): boolean {
  return /\\p{Emoji}/u.test(text || '');
}

function containsHashtag(text: string): boolean {
  return /(^|\\s)#\\w+/.test(text || '');
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
    .replace(/\\bblack women\\b/g, 'Black women')
    .replace(/\\bblack woman\\b/g, 'Black woman')
    .replace(/\\bblack men\\b/g, 'Black men')
    .replace(/\\bblack man\\b/g, 'Black man')
    .replace(/\\bblack hair\\b/g, 'Black hair');
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
"""

if "PINTEREST_RULES" not in content:
    content = content.replace("export interface AnalyzeImageResult {", constants + "\nexport interface AnalyzeImageResult {")


# 2. REPLACE auditSEOOutput
old_audit = """function auditSEOOutput(
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
  const boardWords = boardName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\\s+/).filter(w => w.length > 3);
  const matchedBoardWords = boardWords.filter(w => tl.includes(w));
  if (boardWords.length > 0 && matchedBoardWords.length === 0) {
    issues.push(`Board keyword not reflected in title (board: "${boardName}")`); score -= 20;
  }

  // ─ 4. Prompt accuracy ─
  if (imagePrompt && imagePrompt.length > 10) {
    const promptKeywords = imagePrompt.toLowerCase().match(/\\b(curly|wavy|straight|braids?|cornrow|freehand|natural|loc|twist|afro|blonde|brunette|dark|short|long|medium|pixie|bob|bangs|layers?|protective|crochet|zigzag|wolf cut|shag)\\b/g) || [];
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
  const altWordCount = altText.split(/\\s+/).length;
  if (altWordCount > 25) { issues.push('Alt text too verbose (> 25 words)'); score -= 5; }

  return { score: Math.max(0, score), issues };
}"""

new_audit = """function auditSEOOutput(
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
  if (/\\bblack women\\b/.test(title) || /\\bblack women\\b/.test(description) || /\\bblack women\\b/.test(altText)) {
    issues.push('Lowercase "black women" used (should be "Black women")');
    score -= 10;
  }

  // ─ 5. Board keyword relevance ─
  const boardWords = boardName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\\s+/).filter(w => w.length > 3);
  const matchedBoardWords = boardWords.filter(w => tl.includes(w));
  if (boardWords.length > 0 && matchedBoardWords.length === 0) {
    issues.push(`Board keyword not reflected in title (board: "${boardName}")`); score -= 15;
  }

  // ─ 6. Prompt accuracy ─
  if (imagePrompt && imagePrompt.length > 10) {
    const promptKeywords = imagePrompt.toLowerCase().match(/\\b(curly|wavy|straight|braids?|cornrow|freehand|natural|loc|twist|afro|blonde|brunette|dark|short|long|medium|pixie|bob|bangs|layers?|protective|crochet|zigzag|wolf cut|shag)\\b/g) || [];
    const matchedPromptWords = promptKeywords.filter(k => tl.includes(k) || dl.includes(k));
    if (promptKeywords.length > 0 && matchedPromptWords.length === 0) {
      issues.push('Output does not reflect key terms from the generation prompt'); score -= 25;
    }
  }

  return { score: Math.max(0, score), issues };
}"""
content = content.replace(old_audit, new_audit)

# 3. REPLACE validateTitle
old_validateTitle = """function validateTitle(title: string): string | null {
  if (!title) return 'Title is empty';
  if (title.includes('+')) return 'Title contains "+"';
  if (/hair styling hair/i.test(title)) return 'Title contains "hair styling hair"';
  if (/hairstyle hair/i.test(title)) return 'Title contains "hairstyle hair"';
  if (/\\bhair hair\\b/i.test(title)) return 'Title contains repeated "hair hair"';
  
  // Check for consecutive duplicate words (e.g., "braided braided")
  const dupTitleMatch = /\\b([a-z]+)\\s+\\1\\b/i.exec(title);
  if (dupTitleMatch) return `Title contains consecutive duplicate word: "${dupTitleMatch[0]}"`;

  if (title.length < 30) return `Title too short (${title.length} chars)`;
  if (title.length > 100) return `Title too long (${title.length} chars)`;
  const badPhrases = ['beautiful', 'amazing', 'perfect', 'stunning', 'vibes ✨', 'look ✨', 'that actually works'];
  for (const p of badPhrases) {
    if (title.toLowerCase().includes(p)) return `Title contains spam phrase: "${p}"`;
  }
  return null; // Valid
}"""

new_validateTitle = """function validateTitle(title: string): string | null {
  if (!title) return 'Title is empty';
  const t = normalizeBlackCapitalization(title).trim();
  if (t.length < PINTEREST_RULES.titleMin) return `Title too short (${t.length} chars)`;
  if (t.length > PINTEREST_RULES.titleMax) return `Title too long (${t.length} chars)`;
  if (containsPipe(t)) return 'Title contains "|"';
  if (containsEmoji(t)) return 'Title contains emoji';
  if (t.includes('+')) return 'Title contains "+"';
  const banned = containsBannedWord(t);
  if (banned) return `Title contains banned word: "${banned}"`;
  const dup = /\\b([a-z]+)\\s+\\1\\b/i.exec(t);
  if (dup) return `Title contains consecutive duplicate word: "${dup[0]}"`;
  return null;
}"""
content = content.replace(old_validateTitle, new_validateTitle)

# 4. REPLACE validateDescription
old_validateDescription = """function validateDescription(description: string, visionJSON: any): string | null {
  if (!description) return 'Description is empty';
  if (description.length < 200) return `Description too short (${description.length} chars)`;
  
  // Check for consecutive duplicate words (e.g., "braided braided", "braids braids")
  const dupDescMatch = /\\b([a-z]+)\\s+\\1\\b/i.exec(description);
  if (dupDescMatch) return `Description contains consecutive duplicate word: "${dupDescMatch[0]}"`;

  const hasLayerClaims = /\\blayers?\\b|face-framing layers|lightweight layer/i.test(description);
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
}"""

new_validateDescription = """function validateDescription(description: string, visionJSON: any): string | null {
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
  const dup = /\\b([a-z]+)\\s+\\1\\b/i.exec(d);
  if (dup) return `Description contains consecutive duplicate word: "${dup[0]}"`;

  const hasLayerClaims = /\\blayers?\\b|face-framing layers|lightweight layer/i.test(d);
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
}"""
content = content.replace(old_validateDescription, new_validateDescription)

# 5. REPLACE buildSmartFallback
old_buildSmartFallback = """function buildSmartFallback(
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
  const isBob         = /\\bbob\\b/.test(hairStyle);
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
}"""

new_buildSmartFallback = """function buildSmartFallback(
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
  const isBob         = /\\bbob\\b/.test(hairStyle);
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
}"""
content = content.replace(old_buildSmartFallback, new_buildSmartFallback)

# 6. REPLACE generateTitleSuggestions prompt
old_generateTitlePrompt = """    const system = `You are a Pinterest SEO expert for the hair styling niche. Generate 5 PERFECT pin titles.

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

OUTPUT FORMAT: Return ONLY a raw JSON array of 5 strings. No markdown, no labels.`;"""

new_generateTitlePrompt = """    const system = `You are a Pinterest SEO copywriter for the hairstyle niche.
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
Return ONLY a raw JSON array of 5 strings.`;"""
content = content.replace(old_generateTitlePrompt, new_generateTitlePrompt)

old_titleFallback = """      return [
        `${keyword} on dark wavy hair that frames the face ✨`,
        `How to style ${keyword} at your next salon visit 💫`,
        `${keyword} for round faces and fine hair 🖤`,
        `${keyword} cut with soft face-framing layers ✨`,
        `${keyword} for thick hair that adds natural volume 💕`
      ];"""

new_titleFallback = """      return [
        `${keyword} On Dark Wavy Hair That Frames The Face`,
        `How To Style A ${keyword} Haircut`,
        `${keyword} Hairstyle For Round Faces And Fine Hair`,
        `${keyword} Cut With Soft Face-Framing Layers`,
        `${keyword} For Thick Hair That Adds Natural Volume`
      ];"""
content = content.replace(old_titleFallback, new_titleFallback)

# 7. REPLACE generateDescriptionSuggestions prompt
old_generateDescriptionPrompt = """    const system = `You are a Pinterest SEO copywriter for the hair styling niche. Generate 3 PERFECT pin descriptions.

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

OUTPUT FORMAT: Return ONLY a raw JSON array of 3 strings. No markdown, no labels.`;"""

new_generateDescriptionPrompt = """    const system = `You are a Pinterest SEO copywriter for the hairstyle niche.
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
Return ONLY a raw JSON array of 3 strings.`;"""
content = content.replace(old_generateDescriptionPrompt, new_generateDescriptionPrompt)

old_descriptionFallback = """      return [
        `${kw} creates soft movement and dimension that works on every face shape ✨ Ask your stylist for face-framing pieces with lightweight ends. Save this for your next salon visit! #${kw.replace(/\\s+/g, '')} #LayeredHair #SalonInspo #FaceFramingLayers #HairGoals`,
        `${kw} gives a clean finish that suits oval, round, and heart face shapes 💫 Ask for soft shaping through the mid-lengths and shorter pieces around the face. Pin this for your mood board! #${kw.replace(/\\s+/g, '')} #HairInspo #SalonReady #HairCut`,
        `${kw} works with fine, thick, and curly hair — minimal heat required once the cut settles 🖤 Show your stylist this photo at your next appointment! #${kw.replace(/\\s+/g, '')} #${board.replace(/\\s+/g, '')} #HairTexture #SalonAppointment`
      ];"""

new_descriptionFallback = """      return [
        `${kw} creates soft movement and dimension that works on many face shapes. The stylist used face-framing pieces with lightweight ends for texture. Save this pin for your next hairstyle idea.`,
        `${kw} gives a clean finish that suits various face shapes. The cut includes soft shaping through the mid-lengths and shorter pieces around the face. Pin this look for your next hair appointment.`,
        `${kw} works well with natural texture and requires minimal heat styling. The length is kept balanced around the shoulders for a practical finish. Tap the link for more hairstyle ideas.`
      ];"""
content = content.replace(old_descriptionFallback, new_descriptionFallback)

# 8. REPLACE improveAltText
old_improveAltTextPrompt = """    const system = `You are an accessibility and SEO specialist for Pinterest. Write a concise, descriptive image alt text.

RULES:
1. Describe the ACTUAL VISUAL CONTENT: hair color, style, length, texture, setting.
2. Include the primary keyword ONCE naturally.
3. Keep it 80-150 characters.
4. Useful for blind users.
5. Do NOT use "Image of", "Picture of", "Photo of".
6. No keyword stuffing.
Output ONLY the plain alt text. No quotes, no labels, no formatting.`;"""

new_improveAltTextPrompt = """    const system = `You are an accessibility and Pinterest SEO specialist.
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
Return ONLY the plain alt text.`;"""
content = content.replace(old_improveAltTextPrompt, new_improveAltTextPrompt)

# 9. REPLACE validatePinMetadata
old_validatePinMetadataPrompt = """    const system = `You are a Pinterest SEO auditor. Analyze this pin's metadata and identify specific issues.

CHECK ALL:
1. TITLE: 40-75 chars? Front-loads keyword in first 5 words? Has 1 emoji? Hair-relevant? No "+" signs?
2. DESCRIPTION: 350-480 chars? Starts with keyword? Has CTA? Has 3-5 niche hashtags?
3. SEMANTIC MATCH: Is title+description relevant to the board?
4. SPAM CHECK: Contains "trending on Pinterest", "new obsession", generic phrases?

Return a JSON object: {"isValid": boolean, "warnings": ["actionable warning"]}
Each warning must say EXACTLY what to fix and HOW.`;"""

new_validatePinMetadataPrompt = """    const system = `You are a Pinterest SEO auditor. Analyze this pin's metadata and identify specific issues.

CHECK ALL:
1. TITLE: 45–85 chars, no emoji, no pipe symbols, no banned spam words, natural keyword usage.
2. DESCRIPTION: 220–380 chars, no emoji, no hashtags, complete sentence, natural wording, soft CTA.
3. ALT TEXT: 12–22 words, descriptive only, no CTA, no promotional language.
4. SEMANTIC MATCH: title + description + alt text must match the board and visible hairstyle.
5. HALLUCINATION CHECK: do not mention accessories, extensions, wigs, beads, cuffs, or products unless clearly shown or provided.

Return:
{"isValid": boolean, "warnings": ["specific fix"]}

Each warning must say EXACTLY what to fix and HOW.`;"""
content = content.replace(old_validatePinMetadataPrompt, new_validatePinMetadataPrompt)

old_validatePinMetadataFallback = """      const warnings: string[] = [];
      if (!input.title || input.title.length < 10) warnings.push('Title too short. Write 40-75 characters with primary keyword in first 5 words.');
      if (input.title && input.title.length > 85) warnings.push('Title exceeds 85 characters. Reduce to 75 chars max.');
      if (!input.description || input.description.length < 150) warnings.push('Description too short. Write 350-480 characters starting with your primary keyword.');
      if (input.description && !input.description.includes('#')) warnings.push('Missing hashtags. Add 3-5 hair-specific hashtags at the end.');
      if (!input.destinationUrl || !input.destinationUrl.startsWith('http')) warnings.push('Destination URL missing. Add a valid https:// URL.');
      const emojiCount = (input.title || '').match(/\\p{Emoji}/gu)?.length || 0;
      if (emojiCount === 0) warnings.push('No emoji in title. Add 1 relevant emoji to improve click-through rate.');
      return { isValid: warnings.length === 0, warnings };"""

new_validatePinMetadataFallback = """      const warnings: string[] = [];
      if (!input.title || input.title.length < PINTEREST_RULES.titleMin) warnings.push(`Title too short. Write ${PINTEREST_RULES.titleMin}-${PINTEREST_RULES.titleMax} characters.`);
      if (input.title && input.title.length > PINTEREST_RULES.titleMax) warnings.push(`Title exceeds ${PINTEREST_RULES.titleMax} characters.`);
      if (!input.description || input.description.length < PINTEREST_RULES.descriptionMin) warnings.push(`Description too short. Write ${PINTEREST_RULES.descriptionMin}-${PINTEREST_RULES.descriptionMax} characters.`);
      if (input.description && input.description.length > PINTEREST_RULES.descriptionMax) warnings.push(`Description exceeds ${PINTEREST_RULES.descriptionMax} characters.`);
      if (input.description && containsHashtag(input.description)) warnings.push('Remove hashtags from description.');
      if (input.title && containsEmoji(input.title)) warnings.push('Remove emojis from title.');
      if (input.description && containsEmoji(input.description)) warnings.push('Remove emojis from description.');
      if (!input.destinationUrl || !input.destinationUrl.startsWith('http')) warnings.push('Destination URL missing. Add a valid https:// URL.');
      return { isValid: warnings.length === 0, warnings };"""
content = content.replace(old_validatePinMetadataFallback, new_validatePinMetadataFallback)

# 10. REPLACE generateSEOComplete
old_generateSEOCompletePrompt = """    const system = `You are an elite Pinterest SEO expert for the hair styling niche.

TITLE: 40-75 chars, front-load keyword, 1 emoji, sentence case, search-query style. No "+" signs.
DESCRIPTION: 350-480 chars, start with keyword, 2-3 LSI hair keywords, 1-2 emojis, CTA, 3-5 hair-specific hashtags.
  NEVER use: "trending on Pinterest right now", "new obsession", "unmatched", "takes the look to another level".
ALT TEXT: 80-150 chars, describe the visible hairstyle precisely, keyword once naturally.

Return ONLY raw JSON:
{"title":"","description":"","altText":""}`;"""

new_generateSEOCompletePrompt = """    const system = `You are an elite Pinterest SEO copywriter for the hairstyle niche.

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
{"title":"","description":"","altText":""}`;"""
content = content.replace(old_generateSEOCompletePrompt, new_generateSEOCompletePrompt)

old_generateSEOCompleteFallback = """      return {
        title: `${kw} on wavy hair with face-framing layers ✨`,
        description: `${kw} creates soft movement and dimension that works on every hair type. The cut is lightweight through the ends 🌿 Ask your stylist for face-framing pieces with soft shaping through the mid-lengths. Save this for your next salon appointment! #${kw.replace(/\\s+/g, '')} #${board.replace(/\\s+/g, '')} #LayeredHair #FaceFramingLayers #SalonInspo`,
        altText: `${kw} hairstyle with face-framing layers and natural movement, soft indoor lighting`
      };"""

new_generateSEOCompleteFallback = """      return {
        title: `${kw} On Wavy Hair With Face-Framing Layers`,
        description: `${kw} creates soft movement and dimension that works well with natural texture. The cut is lightweight through the ends with soft shaping. Save this pin for your next hairstyle idea.`,
        altText: `Person with a ${kw} hairstyle featuring face-framing layers and natural movement.`
      };"""
content = content.replace(old_generateSEOCompleteFallback, new_generateSEOCompleteFallback)

# 11. REDUCE FAKE CERTAINTY IN PROMPT-MODE VISION JSON
old_promptModeVision = """        hairLength:             /\\bshort\\b/.test(cleanPrompt) ? 'short' : /\\blong\\b/.test(cleanPrompt) ? 'long' : 'medium',
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
        confidence:             0.95"""

new_promptModeVision = """        hairLength:             /\\bshort\\b/.test(cleanPrompt) ? 'short' : /\\blong\\b/.test(cleanPrompt) ? 'long' : 'unclear',
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
        confidence:             0.7"""
content = content.replace(old_promptModeVision, new_promptModeVision)

# 10/12. REMOVE HARD-SLICING & ADD normalizeFinalSEO in analyzeImage return values
old_fallback_return = """    return {
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
    };"""

new_fallback_return = """    const fallbackNormalized = normalizeFinalSEO(fallbackTitle, fallbackDesc, fallback.altText, visionJSON);
    
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
    };"""
content = content.replace(old_fallback_return, new_fallback_return)

old_stage2_return = """      return {
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
      };"""

new_stage2_return = """      const finalNormalized = normalizeFinalSEO(finalTitle, finalDescription, finalAlt, visionJSON);
      
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
      };"""
content = content.replace(old_stage2_return, new_stage2_return)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Refactoring complete.")
