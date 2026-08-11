import React, { useState } from 'react';
import { ExternalLink, User, Smartphone, Monitor, Layout, Sparkles, Heart, Share2, MoreHorizontal, CheckCircle2, Eye, Type, Bookmark } from 'lucide-react';

export interface OverlayConfig {
  enabled: boolean;
  text: string;
  position: 'top' | 'center' | 'bottom';
  preset: 'modern' | 'badge' | 'gradient' | 'neon' | 'glass' | 'pill' | 'bold';
  bgColor?: string;
  textColor?: string;
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  fontFamily?: 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';
  opacity?: number;
}

interface PreviewCardProps {
  title: string;
  description: string;
  destinationUrl: string;
  altText: string;
  imagePath: string;
  accountNickname?: string;
  overlayConfig?: OverlayConfig;
  onFocusTitle?: () => void;
  onFocusDescription?: () => void;
  onFocusUrl?: () => void;
  seoScore?: number;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({
  title,
  description,
  destinationUrl,
  altText,
  imagePath,
  accountNickname = 'Your Account',
  overlayConfig,
  onFocusTitle,
  onFocusDescription,
  onFocusUrl,
  seoScore
}) => {
  const [viewMode, setViewMode] = useState<'feed' | 'mobile' | 'detail' | 'canvas'>('feed');

  // Format destination URL for display
  const getDomain = (url: string) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace('www.', '');
    } catch (e) {
      return url || 'yourlink.com';
    }
  };

  const localImageSrc = imagePath ? `media:///${imagePath.replace(/\\/g, '/')}` : '';

  // Render Overlay Banner Layer over Image
  const renderTextOverlayBanner = () => {
    if (!overlayConfig || !overlayConfig.enabled || !overlayConfig.text.trim()) return null;

    const { position, preset, bgColor, textColor, fontSize, fontFamily, opacity } = overlayConfig;

    // Position CSS
    let posClass = 'top-4 inset-x-4';
    if (position === 'center') posClass = 'top-1/2 -translate-y-1/2 inset-x-4';
    if (position === 'bottom') posClass = 'bottom-4 inset-x-4';

    // Preset Styles
    let styleObj: React.CSSProperties = {
      color: textColor || '#ffffff',
      opacity: (opacity ?? 100) / 100
    };

    let containerClasses = 'relative p-3.5 rounded-xl shadow-2xl transition-all flex items-center justify-center text-center font-bold tracking-wide uppercase';

    switch (preset) {
      case 'modern':
        containerClasses += ' bg-slate-950/90 border border-slate-700/60 backdrop-blur-md text-slate-100 shadow-slate-950/80';
        break;
      case 'badge':
        containerClasses += ' bg-rose-600/90 text-white rounded-full px-5 py-2 border border-rose-400/50 shadow-lg shadow-rose-950/50';
        break;
      case 'gradient':
        containerClasses += ' bg-gradient-to-r from-red-600 via-pink-600 to-purple-600 text-white border border-white/20 shadow-xl';
        break;
      case 'neon':
        containerClasses += ' bg-black/85 text-amber-300 border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]';
        break;
      case 'glass':
        containerClasses += ' bg-white/20 backdrop-blur-md text-slate-900 border border-white/40 shadow-lg';
        styleObj.color = textColor || '#0f172a';
        break;
      case 'pill':
        containerClasses += ' bg-violet-950/90 text-violet-200 border border-violet-500/40 rounded-full py-2 px-4 shadow-md';
        break;
      case 'bold':
        containerClasses += ' bg-red-600 text-white font-black border-2 border-white shadow-2xl tracking-tighter scale-105';
        break;
    }

    if (bgColor) {
      styleObj.backgroundColor = bgColor;
    }

    // Font size mapping
    let fontClass = 'text-xs';
    if (fontSize === 'sm') fontClass = 'text-[10px]';
    if (fontSize === 'md') fontClass = 'text-xs';
    if (fontSize === 'lg') fontClass = 'text-sm';
    if (fontSize === 'xl') fontClass = 'text-base font-black';

    // Font Family mapping
    let fontFamClass = 'font-sans';
    if (fontFamily === 'serif') fontFamClass = 'font-serif';
    if (fontFamily === 'mono') fontFamClass = 'font-mono';
    if (fontFamily === 'display') fontFamClass = 'font-black tracking-tight';

    return (
      <div className={`absolute ${posClass} pointer-events-none z-20 transition-all duration-300`}>
        <div className={`${containerClasses} ${fontClass} ${fontFamClass}`} style={styleObj}>
          <span className="line-clamp-2 drop-shadow-md">{overlayConfig.text}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* View Switcher Header & SEO Badge */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800/80">
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('feed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              viewMode === 'feed'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Pinterest Home Feed Card Preview"
          >
            <Layout className="w-3.5 h-3.5" /> Feed View
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              viewMode === 'mobile'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Pinterest Mobile App Preview"
          >
            <Smartphone className="w-3.5 h-3.5" /> Mobile
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              viewMode === 'detail'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Expanded Pinterest Web Page"
          >
            <Monitor className="w-3.5 h-3.5" /> Expanded
          </button>
          <button
            onClick={() => setViewMode('canvas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              viewMode === 'canvas'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Focus View on AI Text Overlay Canvas"
          >
            <Type className="w-3.5 h-3.5" /> Canvas
          </button>
        </div>

        {seoScore !== undefined && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 self-end sm:self-auto">
            <span className="text-[10px] uppercase font-extrabold text-slate-400">SEO Health</span>
            <span className={`text-xs font-black font-mono px-2 py-0.5 rounded-md ${
              seoScore >= 80 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              seoScore >= 50 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {seoScore}%
            </span>
          </div>
        )}
      </div>

      {/* Preview Stage Container */}
      <div className="flex justify-center items-center min-h-[440px] bg-slate-950/40 rounded-3xl p-6 border border-slate-800/60 shadow-inner relative overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none" />

        {/* 1. FEED CARD VIEW */}
        {viewMode === 'feed' && (
          <div className="w-[240px] bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl group hover:shadow-red-950/20 transition-all duration-300 relative">
            {/* Image Container */}
            <div className="relative aspect-[2/3] bg-slate-950 w-full flex items-center justify-center overflow-hidden">
              {localImageSrc ? (
                <img
                  src={localImageSrc}
                  alt={altText || 'Pin image'}
                  className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="text-center p-4">
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mx-auto mb-2 text-slate-500">
                    +
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Select Pin Image</p>
                </div>
              )}

              {/* Render AI Text Overlay Banner */}
              {renderTextOverlayBanner()}

              {/* Hover Save & Link overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between items-start pointer-events-none z-30">
                <div className="w-full flex justify-end">
                  <button className="bg-red-600 hover:bg-red-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg pointer-events-auto transform transition-transform hover:scale-105 active:scale-95">
                    Save
                  </button>
                </div>
                {destinationUrl && (
                  <button
                    onClick={onFocusUrl}
                    className="bg-white/95 hover:bg-white text-slate-900 text-[11px] font-bold py-1 px-3 rounded-full flex items-center gap-1.5 shadow-lg max-w-[95%] truncate pointer-events-auto transition-transform hover:scale-105"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0 text-red-600" />
                    <span className="truncate">{getDomain(destinationUrl)}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Meta Section */}
            <div className="p-3 flex flex-col gap-2 bg-slate-900/90">
              <h4
                onClick={onFocusTitle}
                className="text-sm font-bold text-slate-100 line-clamp-2 leading-tight cursor-pointer hover:text-red-400 transition-colors"
                title="Click to edit title"
              >
                {title || 'Pin Title Placeholder'}
              </h4>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-[10px] font-black">
                    {accountNickname.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium truncate max-w-[120px]">
                    {accountNickname}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. MOBILE PINTEREST VIEW */}
        {viewMode === 'mobile' && (
          <div className="w-[300px] bg-slate-950 border-[6px] border-slate-800 rounded-[36px] overflow-hidden shadow-2xl flex flex-col relative text-slate-100 min-h-[560px]">
            {/* Status bar simulator */}
            <div className="bg-slate-950 px-6 py-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-slate-900">
              <span>9:41</span>
              <div className="flex items-center gap-1.5">
                <span>5G</span>
                <div className="w-4 h-2 border border-slate-400 rounded-sm p-0.5">
                  <div className="w-full h-full bg-slate-400 rounded-2px" />
                </div>
              </div>
            </div>

            {/* Header bar */}
            <div className="p-3 flex items-center justify-between border-b border-slate-900 bg-slate-950/90 backdrop-blur">
              <span className="text-xs font-black tracking-wider text-red-500 flex items-center gap-1">
                📌 Pinterest
              </span>
              <div className="flex items-center gap-3 text-slate-400">
                <Share2 className="w-4 h-4 cursor-pointer hover:text-slate-100" />
                <MoreHorizontal className="w-4 h-4 cursor-pointer hover:text-slate-100" />
              </div>
            </div>

            {/* Scrollable Pin Content */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-3">
              {/* Main Image */}
              <div className="relative aspect-[2/3] w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-md">
                {localImageSrc ? (
                  <img src={localImageSrc} alt={altText || ''} className="w-full h-full object-cover" />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 text-xs">No image</div>
                )}
                {renderTextOverlayBanner()}
              </div>

              {/* Action row */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <Heart className="w-5 h-5 text-slate-400 hover:text-red-500 cursor-pointer transition-colors" />
                  <Share2 className="w-5 h-5 text-slate-400 hover:text-slate-100 cursor-pointer" />
                </div>
                <button className="bg-red-600 hover:bg-red-500 text-white font-black text-xs px-5 py-2 rounded-full shadow-lg">
                  Save
                </button>
              </div>

              {/* Destination URL */}
              {destinationUrl && (
                <button
                  onClick={onFocusUrl}
                  className="bg-slate-900 hover:bg-slate-850 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <ExternalLink className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-200 truncate">{getDomain(destinationUrl)}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase font-extrabold flex-shrink-0">Visit</span>
                </button>
              )}

              {/* Title & Description */}
              <div className="flex flex-col gap-1.5">
                <h3 onClick={onFocusTitle} className="text-base font-black text-slate-100 leading-snug cursor-pointer hover:text-red-400">
                  {title || 'Pin Title'}
                </h3>
                <p onClick={onFocusDescription} className="text-xs text-slate-400 leading-relaxed cursor-pointer hover:text-slate-200">
                  {description || 'Pin description will be displayed here...'}
                </p>
              </div>

              {/* Account Creator Row */}
              <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-xl border border-slate-850 mt-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-xs">
                    {accountNickname.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-slate-200">{accountNickname}</span>
                </div>
                <button className="text-[10px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full">
                  Follow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. EXPANDED DESKTOP VIEW */}
        {viewMode === 'detail' && (
          <div className="max-w-[740px] w-full bg-slate-900 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[460px]">
            {/* Left Image View */}
            <div className="w-full md:w-1/2 bg-slate-950 aspect-[2/3] md:aspect-auto flex items-center justify-center border-r border-slate-800/80 relative">
              {localImageSrc ? (
                <img src={localImageSrc} alt={altText || 'Pin image'} className="w-full h-full object-contain" />
              ) : (
                <div className="p-6 text-center text-slate-600 text-xs">No image selected</div>
              )}
              {renderTextOverlayBanner()}
            </div>

            {/* Right Details View */}
            <div className="w-full md:w-1/2 p-7 flex flex-col justify-between gap-5 bg-slate-900">
              <div className="flex flex-col gap-4">
                {/* Header Board Simulator */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-slate-300">Target Board</span>
                  </div>
                  <button className="bg-red-600 hover:bg-red-500 text-white font-black text-xs px-4 py-1.5 rounded-full shadow">
                    Save
                  </button>
                </div>

                {/* Destination Link */}
                {destinationUrl && (
                  <button
                    onClick={onFocusUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-red-400 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800 self-start transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-red-500" />
                    <span>{getDomain(destinationUrl)}</span>
                  </button>
                )}

                {/* Title */}
                <h2
                  onClick={onFocusTitle}
                  className="text-xl font-black text-slate-100 leading-tight cursor-pointer hover:text-red-400 transition-colors"
                >
                  {title || 'Add your title here'}
                </h2>

                {/* Description */}
                <p
                  onClick={onFocusDescription}
                  className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap cursor-pointer hover:text-slate-100 transition-colors max-h-[160px] overflow-y-auto pr-1"
                >
                  {description || 'This is where your Pin description will appear. Tell everyone what your Pin is about.'}
                </p>
              </div>

              {/* Creator details & Alt Text */}
              <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-xs font-black">
                      {accountNickname.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-200 leading-tight">{accountNickname}</h5>
                      <p className="text-[10px] text-slate-500">Pinterest Creator Account</p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-750 px-3.5 py-1.5 rounded-full">
                    Follow
                  </button>
                </div>

                {altText && (
                  <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-850">
                    <span className="text-[9px] text-slate-500 uppercase font-extrabold tracking-wider block">Alt Text (Screen Readers)</span>
                    <span className="text-[11px] text-slate-300 block truncate" title={altText}>{altText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4. CANVAS OVERLAY FOCUS VIEW */}
        {viewMode === 'canvas' && (
          <div className="flex flex-col items-center gap-4 w-full max-w-[420px]">
            <div className="relative aspect-[2/3] w-full bg-slate-950 rounded-2xl border-2 border-dashed border-violet-500/40 overflow-hidden shadow-2xl group">
              {localImageSrc ? (
                <img src={localImageSrc} alt={altText || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs">No image loaded</div>
              )}
              {renderTextOverlayBanner()}

              {/* Grid overlay helpers */}
              <div className="absolute inset-0 border border-white/10 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20" />
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 w-full flex items-center justify-between text-xs text-slate-300">
              <span className="font-bold flex items-center gap-1.5 text-violet-400">
                <Sparkles className="w-4 h-4" /> AI Canvas Overlay Active
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {overlayConfig?.enabled ? `Preset: ${overlayConfig.preset}` : 'Overlay Disabled'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

