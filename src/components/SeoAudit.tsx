import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

interface SeoAuditProps {
  title: string;
  description: string;
  altText: string;
  destinationUrl: string;
  imagePath: string;
  boardName?: string;
}

export const SeoAudit: React.FC<SeoAuditProps> = ({
  title,
  description,
  altText,
  destinationUrl,
  imagePath,
  boardName
}) => {
  const trimTitle = title.trim();
  const trimDesc = description.trim();
  const trimAlt = altText.trim();
  const trimUrl = destinationUrl.trim();

  // Helpers
  const hasEmoji = (text: string) => /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(text);
  const hasHashtags = (text: string) => (text.match(/#\w+/g) || []).length;
  const hasCTA = (text: string) => {
    const ctaPhrases = ['save', 'click', 'tap', 'pin this', 'read more', 'learn more', 'get', 'try', 'shop', 'browse', 'visit', 'check', 'follow', 'grab'];
    const lower = text.toLowerCase();
    return ctaPhrases.some(p => lower.includes(p));
  };

  // ─── Scoring Checks ───
  const containsBannedWords = (text: string) => {
    const banned = ['viral', 'stunning', 'must-have', 'mind-blowing', 'jaw-dropping', 'insane', 'unbelievable'];
    const lower = text.toLowerCase();
    return banned.some(w => lower.includes(w));
  };
  const hasSentenceEnd = (text: string) => /[.!?]$/.test(text.trim());

  const checks = [
    {
      name: 'Title Search Optimization',
      maxScore: 20,
      score: trimTitle.length === 0 ? 0 
        : trimTitle.length >= 45 && trimTitle.length <= 85 ? 20 
        : trimTitle.length >= 25 && trimTitle.length <= 95 ? 14 
        : 6,
      tip: trimTitle.length === 0 
        ? 'Add a keyword-rich title. Front-load your primary search phrase.'
        : trimTitle.length < 45 
          ? `Title is ${trimTitle.length} chars — aim for 45-85 for top search ranking.`
          : trimTitle.length > 85 
            ? `Title is ${trimTitle.length} chars — Pinterest truncates titles over ~85 chars.`
            : `Optimal length (${trimTitle.length} chars). Primary intent keywords are visible in mobile search.`
    },
    {
      name: 'Clean Title Format',
      maxScore: 10,
      score: trimTitle.length === 0 ? 0 : !hasEmoji(trimTitle) && !trimTitle.includes('|') ? 10 : 4,
      tip: trimTitle.length === 0
        ? 'A clean title with no emojis or pipe symbols ensures algorithmic search indexing.'
        : hasEmoji(trimTitle) 
          ? 'Emojis in titles can be flagged as clickbait by Pinterest 2026 visual search.'
          : trimTitle.includes('|')
            ? 'Avoid pipe symbols (|). Use natural sentence structure or colons.'
            : 'Clean title without spam symbols or emojis ✓'
    },
    {
      name: 'Description Depth & Keywords',
      maxScore: 20,
      score: trimDesc.length === 0 ? 0 
        : trimDesc.length >= 220 && trimDesc.length <= 380 ? 20 
        : trimDesc.length >= 120 && trimDesc.length <= 450 ? 14 
        : 6,
      tip: trimDesc.length === 0 
        ? 'Add a 220-380 char description with 2-4 natural semantic search terms.'
        : trimDesc.length < 220 
          ? `Description is ${trimDesc.length} chars — expand to 220-380 for maximum context indexing.`
          : trimDesc.length > 380 
            ? `Description is ${trimDesc.length} chars — Pinterest shows ~232 chars before fold, consider trimming.`
            : `Optimal length (${trimDesc.length} chars). Feed preview and search depth are maximized.`
    },
    {
      name: 'Sentence Integrity & Natural Copy',
      maxScore: 15,
      score: trimDesc.length === 0 ? 0 
        : hasSentenceEnd(trimDesc) && !containsBannedWords(trimDesc) ? 15 
        : hasSentenceEnd(trimDesc) ? 10 : 5,
      tip: trimDesc.length === 0 
        ? 'Ensure your description ends in complete sentences with standard punctuation.'
        : containsBannedWords(trimDesc)
          ? 'Avoid hype spam words (viral, stunning, must-have) to prevent algorithmic downranking.'
          : !hasSentenceEnd(trimDesc)
            ? 'Description should end with complete punctuation (. ! ?).'
            : 'Natural copywriting with complete sentences ✓'
    },
    {
      name: 'Soft Call-to-Action',
      maxScore: 10,
      score: trimDesc.length > 0 && hasCTA(trimDesc) ? 10 : 0,
      tip: hasCTA(trimDesc) 
        ? 'Soft CTA detected ✓ Drives saves and clicks.' 
        : 'Add a natural CTA: "Save this pin for later" or "Pin this look for inspiration."'
    },
    {
      name: 'Alt Text (Accessibility)',
      maxScore: 15,
      score: trimAlt.length === 0 ? 0 
        : trimAlt.length >= 80 && trimAlt.length <= 200 ? 15 
        : trimAlt.length > 0 ? 10 
        : 0,
      tip: trimAlt.length === 0 
        ? 'Add alt text to describe the image. Pinterest indexes this for search.'
        : trimAlt.length < 80 
          ? `Alt text is ${trimAlt.length} chars — expand to 80-200 for better image indexing.`
          : 'Alt text optimized for accessibility and search indexing.'
    },
    {
      name: 'Destination Link',
      maxScore: 10,
      score: (trimUrl.startsWith('http://') || trimUrl.startsWith('https://')) ? 10 : 0,
      tip: !trimUrl 
        ? 'Add your website or landing page link to capture traffic from Pinterest.'
        : !(trimUrl.startsWith('http://') || trimUrl.startsWith('https://'))
          ? 'URL must start with https:// to be valid.'
          : 'Valid link. Pinterest will drive clicks to your site.'
    },
    {
      name: 'Pin Image',
      maxScore: 10,
      score: imagePath.trim().length > 0 ? 10 : 0,
      tip: imagePath.trim().length === 0 
        ? 'Upload a high-quality vertical image (1000×1500px, 2:3 ratio recommended).'
        : 'Image loaded. Use 2:3 ratio for best feed visibility.'
    },
    {
      name: 'Board Relevance',
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
        if (!boardName) return 'Select a target board to check keyword alignment.';
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

  const getScoreColor = (pct: number) => {
    if (pct < 40) return { text: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-950/15', fill: '#fb7185' };
    if (pct < 70) return { text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-950/15', fill: '#fbbf24' };
    return { text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-950/15', fill: '#34d399' };
  };

  const style = getScoreColor(percentage);

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
        <div>
          <h3 className="text-sm font-black text-slate-200 tracking-wider uppercase">Pinterest SEO Score</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Real-time optimization audit</p>
        </div>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${style.bg} ${style.border} ${style.text}`}>
          <span className="text-xl font-black font-mono leading-none">{percentage}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">/ 100</span>
        </div>
      </div>

      {/* Checklist */}
      <div className="flex flex-col gap-2.5">
        {checks.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            {item.score === item.maxScore ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : item.score > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-600 flex-shrink-0 mt-0.5">
                !
              </div>
            )}
            
            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-300 text-[11px]">{item.name}</span>
                <span className={`text-[9px] font-mono ${item.score === item.maxScore ? 'text-emerald-500' : item.score > 0 ? 'text-amber-500' : 'text-slate-600'}`}>
                  {item.score}/{item.maxScore}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.tip}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      {percentage < 70 && (
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40 flex items-center gap-2 mt-1">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <p className="text-[10px] text-slate-500 leading-normal">
            Pins scoring 80+ receive significantly better impressions and engagement on Pinterest search.
          </p>
        </div>
      )}
    </div>
  );
};
