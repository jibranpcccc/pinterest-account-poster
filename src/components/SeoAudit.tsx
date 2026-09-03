import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Sparkles } from 'lucide-react';

export interface SeoAuditProps {
  title: string;
  description: string;
  altText: string;
  destinationUrl: string;
  imagePath: string;
  boardName?: string;
  onAutoOptimize?: () => void;
}

export interface SeoCheckResult {
  name: string;
  maxScore: number;
  score: number;
  tip: string;
}

// ─── Shared 2026 Pinterest SEO Scoring Engine ───
export function evaluatePinSeo(
  title: string,
  description: string,
  altText: string,
  destinationUrl: string,
  imagePath: string,
  boardName?: string
): { checks: SeoCheckResult[]; totalScore: number; maxTotal: number; percentage: number } {
  const trimTitle = (title || '').trim();
  const trimDesc = (description || '').trim();
  const trimAlt = (altText || '').trim();
  const trimUrl = (destinationUrl || '').trim();

  // Modern 2026 Pinterest search helpers
  const hasEmoji = (text: string) => /\p{Extended_Pictographic}/u.test(text);
  const hasHashtags = (text: string) => (text.match(/#\w+/g) || []).length;
  const hasCTA = (text: string) => {
    const ctaPhrases = ['save', 'click', 'tap', 'pin this', 'read more', 'learn more', 'get', 'try', 'shop', 'browse', 'visit', 'check', 'follow', 'grab', 'discover'];
    const lower = text.toLowerCase();
    return ctaPhrases.some(p => lower.includes(p));
  };
  const containsBannedWords = (text: string) => {
    const banned = ['viral', 'stunning', 'must-have', 'mind-blowing', 'jaw-dropping', 'insane', 'unbelievable', 'obsession', 'hair goals'];
    const lower = text.toLowerCase();
    return banned.some(w => lower.includes(w));
  };
  const hasSentenceEnd = (text: string) => /[.!?]$/.test(text.trim());

  const checks: SeoCheckResult[] = [
    {
      name: 'Title Length & Search Visibility',
      maxScore: 20,
      score: trimTitle.length === 0 ? 0 
        : trimTitle.length >= 45 && trimTitle.length <= 85 ? 20 
        : trimTitle.length >= 30 && trimTitle.length <= 95 ? 14 
        : 6,
      tip: trimTitle.length === 0 
        ? 'Add a keyword-rich title. Front-load your primary search phrase in the first 30 characters.'
        : trimTitle.length < 45 
          ? `Title is ${trimTitle.length} chars — aim for 45-85 chars for peak Pinterest search discovery.`
          : trimTitle.length > 85 
            ? `Title is ${trimTitle.length} chars — Pinterest mobile search truncates titles after ~85 chars.`
            : `Optimal length (${trimTitle.length} chars). High-relevance keywords fit mobile search previews.`
    },
    {
      name: 'Clean Title Format (No Spam / Hashtags)',
      maxScore: 10,
      score: trimTitle.length === 0 ? 0 
        : !hasEmoji(trimTitle) && !trimTitle.includes('|') && !trimTitle.includes('+') && hasHashtags(trimTitle) === 0 ? 10 
        : hasHashtags(trimTitle) > 0 ? 2
        : 5,
      tip: trimTitle.length === 0
        ? 'A clean title with zero emojis, hashtags, or pipe symbols ensures algorithmic search indexing.'
        : hasHashtags(trimTitle) > 0
          ? 'Remove hashtags (#) from title — Pinterest 2026 visual search penalizes hashtagged titles.'
          : hasEmoji(trimTitle) 
            ? 'Emojis in titles lower click-through and trigger Pinterest spam filters.'
            : trimTitle.includes('|') || trimTitle.includes('+')
              ? 'Avoid pipe (|) or plus (+) symbols. Use natural sentence structure or commas.'
              : 'Clean title without spam symbols, hashtags, or emojis ✓'
    },
    {
      name: 'Description Depth & Semantic Keywords',
      maxScore: 20,
      score: trimDesc.length === 0 ? 0 
        : trimDesc.length >= 220 && trimDesc.length <= 380 ? 20 
        : trimDesc.length >= 120 && trimDesc.length <= 450 ? 14 
        : 6,
      tip: trimDesc.length === 0 
        ? 'Add a 220-380 char description with 2-4 natural search phrases.'
        : trimDesc.length < 220 
          ? `Description is ${trimDesc.length} chars — expand to 220-380 chars for rich semantic indexing.`
          : trimDesc.length > 380 
            ? `Description is ${trimDesc.length} chars — Pinterest shows ~230 chars before the fold, consider trimming.`
            : `Optimal length (${trimDesc.length} chars). Feed preview and topical indexing are maximized.`
    },
    {
      name: 'Conversational Quality & Zero Hashtags',
      maxScore: 15,
      score: trimDesc.length === 0 ? 0 
        : hasSentenceEnd(trimDesc) && !containsBannedWords(trimDesc) && hasHashtags(trimDesc) === 0 && !hasEmoji(trimDesc) ? 15 
        : hasHashtags(trimDesc) > 0 ? 4
        : hasSentenceEnd(trimDesc) ? 10 : 6,
      tip: trimDesc.length === 0 
        ? 'Ensure your description ends in complete sentences with standard punctuation.'
        : hasHashtags(trimDesc) > 0
          ? 'Remove hashtags (#) from description — Pinterest 2026 algorithm prioritizes natural language and penalizes hashtag clutter.'
          : containsBannedWords(trimDesc)
            ? 'Avoid hype spam words (viral, stunning, must-have) to prevent algorithmic downranking.'
            : !hasSentenceEnd(trimDesc)
              ? 'Description must end with complete terminal punctuation (. ! ?).'
              : 'Natural conversational copywriting with complete sentences & zero hashtags ✓'
    },
    {
      name: 'Soft Call-to-Action',
      maxScore: 10,
      score: trimDesc.length > 0 && hasCTA(trimDesc) ? 10 : 0,
      tip: hasCTA(trimDesc) 
        ? 'Soft CTA detected ✓ Inspires saves and outbound clicks.' 
        : 'Add a natural CTA: "Save this pin for later" or "Pin this look for your next visit."'
    },
    {
      name: 'Alt Text (Accessibility & Lens Indexing)',
      maxScore: 15,
      score: (() => {
        if (trimAlt.length === 0) return 0;
        const words = trimAlt.split(/\s+/).filter(Boolean).length;
        if (words >= 12 && words <= 25 && !hasEmoji(trimAlt) && hasHashtags(trimAlt) === 0) return 15;
        if (words >= 6 && words <= 35) return 10;
        return 5;
      })(),
      tip: (() => {
        if (trimAlt.length === 0) return 'Add alt text describing the image. Pinterest indexes this for visual search.';
        const words = trimAlt.split(/\s+/).filter(Boolean).length;
        if (hasHashtags(trimAlt) > 0) return 'Remove hashtags from alt text — use literal visual descriptions only.';
        if (words < 12) return `Alt text is ${words} words — aim for 15-22 words describing literal image details.`;
        if (words > 25) return `Alt text is ${words} words — keep concise (15-22 words) for accessibility standards.`;
        return 'Alt text optimized for accessibility and Pinterest Lens visual indexing ✓';
      })()
    },
    {
      name: 'Destination Link (Traffic Routing)',
      maxScore: 10,
      score: (trimUrl.startsWith('http://') || trimUrl.startsWith('https://')) ? 10 : 0,
      tip: !trimUrl 
        ? 'Add your website or landing page link to capture traffic from Pinterest.'
        : !(trimUrl.startsWith('http://') || trimUrl.startsWith('https://'))
          ? 'URL must start with https:// to be valid.'
          : 'Valid link. Pinterest will route traffic to your destination URL.'
    },
    {
      name: 'Pin Image Loaded',
      maxScore: 10,
      score: imagePath.trim().length > 0 ? 10 : 0,
      tip: imagePath.trim().length === 0 
        ? 'Upload a high-quality vertical image (1000×1500px, 2:3 ratio recommended).'
        : 'Image loaded. 2:3 vertical aspect ratio delivers maximum home feed engagement.'
    },
    {
      name: 'Board Topical Relevance',
      maxScore: 5,
      score: (() => {
        if (!boardName || !trimTitle) return 0;
        const boardWords = boardName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const titleLower = trimTitle.toLowerCase();
        const descLower = trimDesc.toLowerCase();
        const matches = boardWords.filter(w => titleLower.includes(w) || descLower.includes(w));
        return matches.length > 0 ? 5 : 0;
      })(),
      tip: (() => {
        if (!boardName) return 'Select a target board to evaluate keyword alignment.';
        if (!trimTitle) return 'Add a title first.';
        const boardWords = boardName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const titleLower = trimTitle.toLowerCase();
        const descLower = trimDesc.toLowerCase();
        const matches = boardWords.filter(w => titleLower.includes(w) || descLower.includes(w));
        return matches.length > 0 
          ? `Content aligns with board "${boardName}" ✓` 
          : `Title/description should reference "${boardName}" keywords for board-specific ranking.`;
      })()
    }
  ];

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = checks.reduce((sum, c) => sum + c.maxScore, 0);
  const percentage = Math.round((totalScore / maxTotal) * 100);

  return { checks, totalScore, maxTotal, percentage };
}

export const SeoAudit: React.FC<SeoAuditProps> = ({
  title,
  description,
  altText,
  destinationUrl,
  imagePath,
  boardName,
  onAutoOptimize
}) => {
  const { checks, percentage } = evaluatePinSeo(title, description, altText, destinationUrl, imagePath, boardName);

  const getScoreColor = (pct: number) => {
    if (pct < 45) return { text: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-950/20', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (pct < 75) return { text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-950/20', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return { text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-950/20', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  };

  const style = getScoreColor(percentage);

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-slate-800/80 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-200 tracking-wider uppercase">2026 Pinterest SEO Score</h3>
            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/50">
              Visual Search
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Real-time Pinterest algorithm compliance audit</p>
        </div>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${style.bg} ${style.border} ${style.text}`}>
          <span className="text-xl font-black font-mono leading-none">{percentage}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">/ 100</span>
        </div>
      </div>

      {/* 1-Click Auto-Optimize Button if issues exist */}
      {percentage < 85 && onAutoOptimize && (
        <button
          type="button"
          onClick={onAutoOptimize}
          className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-950/40 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>⚡ Auto-Clean SEO (Strip Hashtags, Emojis & Fix Format)</span>
        </button>
      )}

      {/* Checklist */}
      <div className="flex flex-col gap-2.5">
        {checks.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2.5 text-xs p-2 rounded-xl bg-slate-950/40 border border-slate-900/60">
            {item.score === item.maxScore ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : item.score > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-rose-500/40 bg-rose-950/30 flex items-center justify-center text-[9px] font-bold text-rose-400 flex-shrink-0 mt-0.5">
                !
              </div>
            )}
            
            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-200 text-[11px]">{item.name}</span>
                <span className={`text-[10px] font-mono font-black ${item.score === item.maxScore ? 'text-emerald-400' : item.score > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {item.score}/{item.maxScore}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{item.tip}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 2026 Pinterest Search Engine Guidance */}
      <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex items-start gap-2.5 mt-1">
        <HelpCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-normal">
          <strong className="text-slate-300">2026 Algorithm Rule:</strong> Pinterest rewards clean titles with front-loaded keywords, 220–380 char natural descriptions, and 15–22 word literal alt text. Hashtags (#) are deprecated and downranked by Pinterest Lens.
        </p>
      </div>
    </div>
  );
};
