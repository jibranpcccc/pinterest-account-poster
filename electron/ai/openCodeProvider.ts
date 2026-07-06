import { DbManager } from '../database/db';
import * as fs from 'fs';
import * as path from 'path';

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

// ===== In-memory Key Pool Cache (5 minute TTL) =====
let _keyPoolCache: { accountId: string; token: string }[] = [];
let _keyPoolCacheTime = 0;
const KEY_POOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class OpenCodeProvider {
  private db: DbManager;

  constructor(db: DbManager) {
    this.db = db;
  }

  private async getClientConfig() {
    const settings = await this.db.getSettings();
    return {
      enabled: settings.aiEnabled === true,
      apiKey: settings.aiApiKey || process.env.OPENCODE_API_KEY || '',
      baseUrl: settings.aiBaseUrl || process.env.OPENCODE_BASE_URL || 'https://api.opencode.dev/v1',
      model: settings.aiModel || process.env.OPENCODE_MODEL || 'opencode-big-pickle',
      timeout: (settings.aiTimeout || 45) * 1000
    };
  }

  /**
   * Build a rich context string from all available signals.
   */
  private buildContext(input: AIInput): string {
    const parts: string[] = [];
    if (input.boardName) parts.push(`Pinterest Board: "${input.boardName}"`);
    if (input.topic) parts.push(`Topic/Niche: ${input.topic}`);
    if (input.keyword) parts.push(`Primary Keyword: ${input.keyword}`);
    if (input.tone) parts.push(`Tone: ${input.tone}`);
    if (input.audience) parts.push(`Target Audience: ${input.audience}`);
    if (input.imageNotes) parts.push(`Image Content/Notes: ${input.imageNotes}`);
    if (input.title) parts.push(`Current Title Draft: ${input.title}`);
    if (input.description) parts.push(`Current Description Draft: ${input.description}`);
    if (input.destinationUrl) parts.push(`Destination URL: ${input.destinationUrl}`);
    return parts.join('\n');
  }

  public async generateTitleSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO expert specializing in the 2026 Pinterest search algorithm. Generate 5 PERFECT pin titles that maximize impressions, saves, and click-through rate.

PINTEREST TITLE RULES (2026 Algorithm):
1. FRONT-LOAD primary keyword — most searched term MUST appear in the first 3-5 words. Pinterest's algorithm indexes the first 40 chars most heavily.
2. BOARD RELEVANCE — title MUST be directly relevant to the board niche. The algorithm scores semantic match between pin and board.
3. SEARCH INTENT — write as a search query. Ask: "What would someone type to find this?" Use that exact phrasing.
4. LENGTH — 40–75 characters. Pinterest truncates at ~85. Sweet spot is 50-70 chars.
5. POWER WORDS — include 1-2: "Easy", "Simple", "Stunning", "DIY", "Budget", "Quick", "Step-by-Step", "Best", "Beautiful", "Cozy", "Dreamy", "Modern", "Perfect", "Ultimate", "Gorgeous", "Aesthetic".
6. EMOJIS — 1 relevant emoji placed naturally in the title (not just at the end). Match the niche: 🏡 home, 🌿 nature, 💄 beauty, 🎨 art, 🍽️ food, 💪 fitness, ✨ lifestyle.
7. SENTENCE CASE — capitalize first word and proper nouns only.
8. DIFFERENT ANGLES — each of the 5 titles should target a different search intent or sub-topic angle.
9. NEVER prefix with numbers like "1." or "2.".
10. SEMANTIC CLUSTER — all 5 titles must belong to the same topic/niche semantic cluster as the board.

OUTPUT FORMAT: Return ONLY a raw JSON array of 5 strings. No markdown, no labels, no explanations.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.slice(0, 5);
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate titles via AI:', e);
      const keyword = input.keyword || input.topic || input.boardName || 'Amazing Idea';
      return [
        `${keyword} ideas that will transform your space ✨`,
        `Easy ${keyword} tips you need to try this year`,
        `The most beautiful ${keyword} inspiration 🌿`,
        `Step-by-step ${keyword} guide for beginners`,
        `Stunning ${keyword} ideas on a budget 💡`
      ];
    }
  }

  public async generateDescriptionSuggestions(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest SEO copywriter specializing in the 2026 Pinterest algorithm. Generate 3 PERFECT pin descriptions that maximize search visibility, saves, and outbound clicks.

PINTEREST DESCRIPTION RULES (2026 Algorithm):
1. FIRST SENTENCE — MUST start with the primary keyword. This is indexed most heavily. Make it a complete, compelling sentence.
2. BOARD ANCHOR — naturally reference the board's niche within the first 2 sentences.
3. SECONDARY KEYWORDS — include 2-3 LSI/related keywords that Pinterest users also search for. Weave them naturally.
4. LENGTH — 400-500 characters is optimal. Write 2-3 engaging paragraphs. Utilize the maximum space to tell a story or give context. NEVER exceed 500 characters.
5. EMOJIS — 1-2 relevant emojis placed naturally within the text (not all clustered together).
6. CALL-TO-ACTION — end with a clear CTA: "Save for later!", "Click for the full tutorial!", "Pin this for inspiration!", "Tap to see more!"
7. HASHTAGS — add 3-5 niche-specific hashtags at the very end. Example: #ModernKitchen #KitchenIdeas #HomeDecor (NOT #viral #trending #pinterest).
8. NEVER start with "Discover", "Check out", "Looking for", "Are you". These are Pinterest spam flags.
9. NEVER prefix descriptions with numbers like "1.", "2.".
10. Write naturally — like a recommendation from a knowledgeable friend, not an ad.

OUTPUT FORMAT: Return ONLY a raw JSON array of 3 strings. No markdown, no labels, no explanations.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate descriptions via AI:', e);
      const kw = input.keyword || input.topic || input.boardName || 'this idea';
      const board = input.boardName || 'design';
      return [
        `${kw} made simple — everything you need to know in one place ✨ Save for later! #${kw.replace(/\s+/g, '')} #${board.replace(/\s+/g, '')} #Inspiration`,
        `Transform your space with these ${kw} ideas 💡 Step-by-step guide inside. Pin this for inspiration! #${kw.replace(/\s+/g, '')} #DIY #HomeDecor`,
        `${kw} tips that actually work — tested and proven! 🌿 Click for the full guide. #${kw.replace(/\s+/g, '')} #Tutorial #Design`
      ];
    }
  }

  public async improveAltText(input: AIInput): Promise<string> {
    const system = `You are an accessibility and SEO specialist for Pinterest. Write a concise, descriptive image alt text that helps both screen readers and Pinterest's Visual Graph algorithm.

ALT TEXT RULES (2026):
1. Describe the ACTUAL VISUAL CONTENT: objects, colors, style, composition, setting, textures.
2. Include the primary keyword ONCE naturally — Pinterest's Visual Graph uses alt text for semantic ranking.
3. Keep it 80-200 characters.
4. Useful for blind users — they should understand the image without seeing it.
5. Do NOT use "Image of", "Picture of", "Photo of" — screen readers already say this.
6. Do NOT keyword stuff — one natural mention is optimal.
Output ONLY the plain alt text. No quotes, no labels, no formatting.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      return result.trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      console.error('Failed to improve alt text via AI:', e);
      return `${input.topic || input.boardName || 'Creative'} design with detailed styling and visual composition.`;
    }
  }

  public async generateKeywords(input: AIInput): Promise<string[]> {
    const system = `You are a Pinterest keyword research expert. Generate 15 highly relevant Pinterest search keywords/tags for this pin.

RULES (2026 Pinterest Algorithm):
1. Mix of SHORT-TAIL (1 word), MID-TAIL (2 words), and LONG-TAIL (3-4 words) keywords.
2. Include the board niche keywords.
3. Include seasonal/trending variations if relevant (e.g., "summer 2026", "fall aesthetic").
4. Include action-intent keywords (e.g., "how to", "DIY", "easy", "step by step").
5. Include audience-specific variations (e.g., "for beginners", "on a budget", "small space").
6. All keywords must belong to the SAME semantic cluster as the board/topic.
7. Return ONLY a raw JSON array of strings. No markdown, no labels.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      return [cleaned];
    } catch (e) {
      console.error('Failed to generate keywords via AI:', e);
      const base = input.keyword || input.topic || input.boardName || 'inspiration';
      return [
        base, `${base} ideas`, `${base} tips`, `${base} inspiration`, `${base} aesthetic`,
        `DIY ${base}`, `easy ${base}`, `best ${base}`, `${base} for beginners`,
        `${base} 2026`, `${base} on a budget`, `modern ${base}`, `${base} design`,
        `how to ${base}`, `${base} tutorial`
      ];
    }
  }

  public async validatePinMetadata(input: AIInput): Promise<{ isValid: boolean; warnings: string[] }> {
    const system = `You are a Pinterest SEO auditor for the 2026 algorithm. Analyze this pin's metadata and identify specific issues.

CHECK ALL OF THE FOLLOWING:
1. TITLE: Is it 40-75 chars? Does it front-load primary keyword in first 5 words? Does it have 1 power word? 1 emoji? Is it relevant to the board?
2. DESCRIPTION: Is it 400-500 chars? Does it START with the primary keyword? Does it have a CTA? Does it have 3-5 niche hashtags (not generic)? Does it reference the board niche?
3. SEMANTIC MATCH: Is title+description semantically relevant to the board name?
4. KEYWORD STUFFING: Is the same keyword repeated more than 3 times across title+description?
5. EMOJI COUNT: Are there 1-2 emojis total (not 0, not 5+)?
6. DESTINATION URL: Is it provided and starts with https://?
7. ALT TEXT: If provided, is it 80-200 chars and descriptive?

Return a JSON object: {"isValid": boolean, "warnings": ["actionable warning 1", "actionable warning 2"]}
Each warning must say EXACTLY what to fix and HOW.`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      const warnings: string[] = [];
      if (!input.title || input.title.length < 10) warnings.push('Title is too short. Write 40-75 characters with the primary keyword in the first 5 words.');
      if (input.title && input.title.length > 85) warnings.push('Title exceeds 85 characters and will be truncated in the Pinterest feed. Reduce to 75 chars max.');
      if (!input.description || input.description.length < 150) warnings.push('Description is too short. Write 400-500 characters starting with your primary keyword.');
      if (input.description && input.description.length > 500) warnings.push('Description is too long. Keep it under 500 characters for optimal Pinterest feed visibility.');
      if (input.description && !input.description.includes('#')) warnings.push('Missing hashtags. Add 3-5 niche-specific hashtags at the end (e.g., #ModernKitchen #HomeDecor).');
      if (!input.destinationUrl || !input.destinationUrl.startsWith('http')) warnings.push('Destination URL is missing or invalid. Add a valid https:// URL to drive traffic to your site.');
      const emojiCount = (input.title || '').match(/\p{Emoji}/gu)?.length || 0;
      if (emojiCount === 0) warnings.push('No emoji in title. Add 1 relevant emoji to improve click-through rate.');
      if (emojiCount > 3) warnings.push('Too many emojis in title. Use just 1 for a professional look that Pinterest ranks higher.');
      return { isValid: warnings.length === 0, warnings };
    }
  }

  public async generateSEOComplete(input: AIInput): Promise<{ title: string; description: string; altText: string }> {
    const system = `You are an elite Pinterest SEO expert. Your task is to generate a PERFECT Pinterest Pin Title, Description, and Alt Text in one response, optimized for the 2026 Pinterest search algorithm.

PINTEREST TITLE RULES (2026):
1. FRONT-LOAD primary keyword — must appear in first 3-5 words.
2. Length: 40-75 characters.
3. Include 1 relevant emoji naturally (not just at the end).
4. Use 1-2 power words (Easy, Simple, Stunning, DIY, Budget, Best, Beautiful, Modern, Cozy, Ultimate, Gorgeous).
5. Write as a search query — what would someone type to find this?
6. NEVER prefix with numbers.
7. Sentence case only.
8. MUST be semantically relevant to the board niche.

PINTEREST DESCRIPTION RULES (2026):
1. MUST start with the primary keyword — first sentence contains keyword AND board niche reference.
2. Include 2-3 LSI/related keywords naturally woven in.
3. Length: 400-500 characters. Write 2-3 rich, engaging sentences. Use ALL available space — never write less than 350 characters. NEVER exceed 500 characters.
4. Include 1-2 emojis placed naturally within text.
5. End with a clear CTA (Save for later! / Click for the full guide! / Pin this for inspiration!).
6. Finish with 3-5 niche-specific hashtags.
7. NEVER start with "Discover", "Check out", "Looking for", or "Are you".
8. NEVER prefix with numbers.

ALT TEXT RULES (2026):
1. Describe the actual visual details (objects, colors, style, composition, setting) in 80-200 characters.
2. Include primary keyword once naturally.
3. Do NOT start with "Image of" or "Photo of".
4. Useful for Pinterest's Visual Graph semantic indexing.

OUTPUT FORMAT — Return ONLY this raw JSON object, nothing else:
{
  "title": "...",
  "description": "...",
  "altText": "..."
}`;

    const user = this.buildContext(input);

    try {
      const result = await this.makeChatCompletion(system, user);
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: parsed.title || '',
        description: parsed.description || '',
        altText: parsed.altText || ''
      };
    } catch (e) {
      console.error('Failed to generate complete SEO via AI:', e);
      const kw = input.keyword || input.topic || input.boardName || 'Amazing Idea';
      const board = input.boardName || input.topic || 'inspiration';
      return {
        title: `${kw} ideas that will inspire you ✨`,
        description: `${kw} is one of the most searched topics on Pinterest right now, and for good reason ✨ Whether you're just starting out or looking to level up your ${board} game, this pin has everything you need. Save it now and come back to it whenever you need fresh ideas! #${kw.replace(/\s+/g, '')} #${board.replace(/\s+/g, '')} #Inspiration #DIY #PinterestFinds`,
        altText: `${kw} composition with detailed ${board} styling elements and creative design`
      };
    }
  }

  public async syncCloudflareKeysPool(): Promise<{ accountId: string; token: string }[]> {
    // Return cached pool if still fresh
    const now = Date.now();
    if (_keyPoolCache.length > 0 && (now - _keyPoolCacheTime) < KEY_POOL_CACHE_TTL_MS) {
      console.log(`[Cloudflare Key Pool] Using cached pool (${_keyPoolCache.length} keys, ${Math.round((KEY_POOL_CACHE_TTL_MS - (now - _keyPoolCacheTime)) / 1000)}s remaining)`);
      return _keyPoolCache;
    }

    const pool: { accountId: string; token: string }[] = [];
    const nowSec = now / 1000;

    // 1. Read cloudflare_working_accounts.txt
    const txtPath = 'c:\\Users\\jibra\\Desktop\\1\\hermes agent\\cloudflare_working_accounts.txt';
    if (fs.existsSync(txtPath)) {
      try {
        const content = fs.readFileSync(txtPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const accId = parts[0].trim();
            const token = parts[1].trim();
            if (accId && token.startsWith('cfut_')) {
              pool.push({ accountId: accId, token });
            }
          }
        }
      } catch (err) {
        console.error('Error reading cloudflare_working_accounts.txt:', err);
      }
    }

    // 2. Read ~/.hermes/.env for CLOUDFLARE_API_KEY_N
    const envPath = 'C:\\Users\\jibra\\.hermes\\.env';
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        const keysMap = new Map<string, string>();
        const accsMap = new Map<string, string>();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('#') || !cleanLine.includes('=')) continue;
          
          const idxOfEq = cleanLine.indexOf('=');
          const name = cleanLine.substring(0, idxOfEq).trim();
          const val = cleanLine.substring(idxOfEq + 1).trim();
          if (!name || !val) continue;

          if (name === 'CLOUDFLARE_API_KEY') keysMap.set('main', val);
          if (name === 'CLOUDFLARE_ACCOUNT_ID') accsMap.set('main', val);

          const keyMatch = name.match(/^CLOUDFLARE_API_KEY_(\d+)$/);
          if (keyMatch) keysMap.set(keyMatch[1], val);

          const accMatch = name.match(/^CLOUDFLARE_ACCOUNT_ID_(\d+)$/);
          if (accMatch) accsMap.set(accMatch[1], val);
        }

        for (const [idx, token] of keysMap.entries()) {
          const accId = accsMap.get(idx);
          if (accId && token.startsWith('cfut_')) {
            if (!pool.some(p => p.token === token)) {
              pool.push({ accountId: accId, token });
            }
          }
        }
      } catch (err) {
        console.error('Error reading ~/.hermes/.env:', err);
      }
    }

    // 3. Filter out exhausted keys
    const statusPaths = [
      'c:\\Users\\jibra\\Desktop\\1\\hermes agent\\logs\\cloudflare_status.json',
      'C:\\Users\\jibra\\.hermes\\logs\\cloudflare_status.json',
      'c:\\Users\\jibra\\Desktop\\1\\openclaw\\logs\\cloudflare_status.json'
    ];
    let exhaustedMap: Record<string, number> = {};

    for (const p of statusPaths) {
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          exhaustedMap = { ...exhaustedMap, ...data };
        } catch {}
      }
    }

    const workingPool = pool.filter(cred => {
      const until = exhaustedMap[cred.token] || 0;
      return until <= nowSec;
    });

    console.log(`[Cloudflare Key Pool] Synced from disk: ${pool.length} total, ${workingPool.length} working`);
    
    // Update DB and cache
    await this.db.saveSetting('cloudflareKeysPool', JSON.stringify(workingPool));

    const settings = await this.db.getSettings();
    if (workingPool.length > 0 && (!settings.aiApiKey || settings.aiApiKey.startsWith('cfut_'))) {
      const randomKey = workingPool[Math.floor(Math.random() * workingPool.length)];
      await this.db.saveSetting('aiApiKey', randomKey.token);
      if (!settings.aiBaseUrl || settings.aiBaseUrl.includes('opencode.dev')) {
        await this.db.saveSetting('aiBaseUrl', `https://api.cloudflare.com/client/v4/accounts/${randomKey.accountId}/ai/run`);
      }
    }

    // Update in-memory cache
    _keyPoolCache = workingPool;
    _keyPoolCacheTime = now;

    return workingPool;
  }

  private async makeChatCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    const config = await this.getClientConfig();
    if (!config.enabled) {
      throw new Error('AI Assist is disabled. Please check Settings.');
    }

    // Use cached key pool
    const workingPool = await this.syncCloudflareKeysPool().catch(() => [] as { accountId: string; token: string }[]);
    
    let attempts = 0;
    const maxAttempts = Math.max(1, Math.min(5, workingPool.length || 1));
    
    while (attempts < maxAttempts) {
      attempts++;
      
      let apiKey = config.apiKey;
      let baseUrl = config.baseUrl;
      let accountId = '';

      const isCloudflare = config.baseUrl.includes('cloudflare.com') || config.apiKey.startsWith('cfut_') || (workingPool.length > 0 && !config.apiKey);
      
      if (isCloudflare && workingPool.length > 0) {
        const selectedCred = workingPool[Math.floor(Math.random() * workingPool.length)];
        apiKey = selectedCred.token;
        accountId = selectedCred.accountId;
        baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
      }

      if (!apiKey) {
        throw new Error('API key is missing. Please configure your AI API key in Settings.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      try {
        let response: Response;
        
        if (isCloudflare) {
          const runUrl = `${baseUrl.replace(/\/+$/, '')}/${config.model}`;
          response = await fetch(runUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ]
            }),
            signal: controller.signal
          });
        } else {
          const chatUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
          response = await fetch(chatUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.7
            }),
            signal: controller.signal
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`AI request attempt ${attempts} failed (${response.status}): ${errorText}`);
          
          if (isCloudflare && (response.status === 429 || response.status === 401)) {
            // Invalidate cache on rate limit/auth error so next call re-syncs
            _keyPoolCacheTime = 0;
            // Exponential backoff with jitter
            const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1) + Math.random() * 500, 8000);
            console.log(`[AI] Rate limited. Backing off ${Math.round(backoffMs)}ms before retry ${attempts + 1}/${maxAttempts}...`);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
          throw new Error(`AI API error (${response.status}): ${errorText || response.statusText}`);
        }

        const data = await response.json();
        
        if (isCloudflare) {
          return data.result?.response || data.result || '';
        } else {
          return data.choices?.[0]?.message?.content || '';
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (attempts >= maxAttempts) {
          throw e;
        }
        const backoffMs = Math.min(800 * attempts + Math.random() * 400, 5000);
        console.warn(`AI call attempt ${attempts} failed: ${e.message}. Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    throw new Error('AI Chat Completion failed after all attempts.');
  }

  public async analyzeImage(imagePath: string, boardName?: string, topic?: string, destinationUrl?: string): Promise<{ title: string; description: string; altText: string }> {
    const config = await this.getClientConfig();
    if (!config.apiKey) {
      throw new Error('AI Provider API Key is missing. Please configure your API key in Settings.');
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found for analysis: ${imagePath}`);
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const base64Image = imageBuffer.toString('base64');

    const boardContext = boardName ? `\nIMPORTANT: This pin is for a Pinterest board called "${boardName}". The title, description, and alt text MUST be semantically relevant to this board's niche. The board name should appear naturally in the description.` : '';
    const topicContext = topic ? `\nUser's niche/topic: "${topic}".` : '';
    const urlContext = destinationUrl ? `\nDestination URL: ${destinationUrl} — the description should naturally lead users to want to visit this link.` : '';

    const prompt = `You are an elite Pinterest SEO expert trained on the 2026 Pinterest ranking algorithm. Analyze this image and generate PERFECT Pinterest pin metadata.${boardContext}${topicContext}${urlContext}

Return ONLY a raw JSON object with these exact fields:
{
  "title": "A search-optimized title (40-75 chars) that FRONT-LOADS the primary keyword in the first 3-5 words. Include 1 relevant emoji naturally. Use 1-2 power words (Easy, Stunning, DIY, Best, Modern, Cozy, etc). Write as the exact search query a Pinterest user would type. Sentence case only. Do NOT prefix with numbers.",
  "description": "A rich, engaging description of 400-500 characters that STARTS with the primary keyword. Write 2-3 sentences covering the niche, related topics, and why this pin is valuable. Reference the board niche naturally. Include 2-3 related LSI keywords. Add 1-2 emojis within the text. End with a CTA (Save for later! / Click for full details! / Pin this!). Finish with 3-5 niche-specific hashtags. NEVER write less than 350 characters. Do NOT start with 'Discover', 'Check out', or 'Looking for'. Do NOT prefix with numbers.",
  "altText": "Concise descriptive alt text (80-200 chars) describing visual details — objects, colors, style, composition, setting. Include the primary keyword once naturally. Do NOT start with 'Image of' or 'Photo of'."
}
Return ONLY the raw JSON. No markdown, no code blocks, no extra text.`;

    const workingPool = await this.syncCloudflareKeysPool().catch(() => [] as { accountId: string; token: string }[]);
    
    let attempts = 0;
    const maxAttempts = Math.max(1, Math.min(5, workingPool.length || 1));

    while (attempts < maxAttempts) {
      attempts++;
      
      let apiKey = config.apiKey;
      let baseUrl = config.baseUrl;
      let accountId = '';

      const isCloudflare = config.baseUrl.includes('cloudflare.com') || config.apiKey.startsWith('cfut_') || (workingPool.length > 0 && !config.apiKey);

      if (isCloudflare && workingPool.length > 0) {
        const selectedCred = workingPool[Math.floor(Math.random() * workingPool.length)];
        apiKey = selectedCred.token;
        accountId = selectedCred.accountId;
        baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
      }

      if (!apiKey) {
        throw new Error('API key is missing.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout * 2);

      try {
        let response: Response;
        const isCloudflareDirect = baseUrl.includes('cloudflare.com') && !baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions');

        if (isCloudflareDirect) {
          const runUrl = `${baseUrl.replace(/\/+$/, '')}/@cf/meta/llama-4-scout-17b-16e-instruct`;
          response = await fetch(runUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    { type: 'image', image: Array.from(imageBuffer) }
                  ]
                }
              ]
            }),
            signal: controller.signal
          });
        } else {
          const chatUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
          response = await fetch(chatUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: '@cf/meta/llama-4-scout-17b-16e-instruct',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    }
                  ]
                }
              ],
              temperature: 0.7
            }),
            signal: controller.signal
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`Vision API attempt ${attempts} failed (${response.status}): ${errorText}`);
          if (isCloudflare && (response.status === 429 || response.status === 401)) {
            _keyPoolCacheTime = 0;
            const backoffMs = Math.min(2000 * attempts + Math.random() * 1000, 10000);
            console.log(`[Vision] Rate limited. Backing off ${Math.round(backoffMs)}ms...`);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
          throw new Error(`Vision API error (${response.status}): ${errorText || response.statusText}`);
        }

        const data = await response.json();
        let content = '';
        if (isCloudflareDirect) {
          content = data.result?.response || data.result || '';
        } else {
          content = data.choices?.[0]?.message?.content || '';
        }

        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          title: parsed.title || '',
          description: parsed.description || '',
          altText: parsed.altText || ''
        };
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (attempts >= maxAttempts) {
          throw e;
        }
        const backoffMs = Math.min(1500 * attempts + Math.random() * 700, 8000);
        console.warn(`AI Vision attempt ${attempts} failed: ${e.message}. Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    // Fallback — use board name and topic for richer content
    const rawName = path.basename(imagePath, path.extname(imagePath)).replace(/[-_]/g, ' ').replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();
    const fallbackName = rawName || boardName || topic || 'Beautiful design';
    const fallbackBoard = boardName || topic || 'inspiration';
    return {
      title: `${fallbackName} ideas you'll love ✨`,
      description: `${fallbackName} is trending on Pinterest and it's easy to see why ✨ This pin brings together the best ${fallbackBoard} inspiration to help you get started. Whether you're a beginner or a seasoned pro, you'll find exactly what you're looking for here. Save it now for your next project! #${fallbackName.replace(/\s+/g, '')} #${fallbackBoard.replace(/\s+/g, '')} #Inspiration #PinterestFinds #Design`,
      altText: `${fallbackName} with detailed ${fallbackBoard} styling, colors, and creative composition`
    };
  }
}
