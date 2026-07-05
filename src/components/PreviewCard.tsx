import React, { useState } from 'react';
import { ExternalLink, User } from 'lucide-react';

interface PreviewCardProps {
  title: string;
  description: string;
  destinationUrl: string;
  altText: string;
  imagePath: string;
  accountNickname?: string;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({
  title,
  description,
  destinationUrl,
  altText,
  imagePath,
  accountNickname = 'Your Account'
}) => {
  const [viewMode, setViewMode] = useState<'feed' | 'detail'>('feed');

  // Format destination URL for display (e.g. "github.com")
  const getDomain = (url: string) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace('www.', '');
    } catch (e) {
      return url || 'yourlink.com';
    }
  };

  const localImageSrc = imagePath ? `media:///${imagePath.replace(/\\/g, '/')}` : '';

  return (
    <div className="w-full flex flex-col gap-4">
      {/* View Selector */}
      <div className="flex gap-2 p-1 bg-slate-950/60 border border-slate-800 rounded-xl self-center">
        <button
          onClick={() => setViewMode('feed')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
            viewMode === 'feed' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Pinterest Feed View
        </button>
        <button
          onClick={() => setViewMode('detail')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
            viewMode === 'detail' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Expanded Detail View
        </button>
      </div>

      {/* Preview Container */}
      <div className="flex justify-center items-start min-h-[400px] bg-slate-950/20 rounded-2xl p-6 border border-slate-800/40">
        {viewMode === 'feed' ? (
          /* Feed Card View */
          <div className="w-[236px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md group hover:shadow-lg transition-all duration-300">
            {/* Image Section */}
            <div className="relative aspect-[2/3] bg-slate-950 w-full flex items-center justify-center overflow-hidden">
              {localImageSrc ? (
                <img
                  src={localImageSrc}
                  alt={altText || 'Pin image'}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="text-center p-4">
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mx-auto mb-2">
                    <span className="text-slate-600 font-bold">+</span>
                  </div>
                  <p className="text-xs text-slate-500">No Image Selected</p>
                </div>
              )}

              {/* Hover save button overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between items-start pointer-events-none">
                <div className="w-full flex justify-end">
                  <button className="bg-pinterest-red text-white text-xs font-bold px-3 py-1.5 rounded-full shadow pointer-events-auto hover:bg-pinterest-darkRed">
                    Save
                  </button>
                </div>
                {destinationUrl && (
                  <div className="bg-white/90 backdrop-blur text-slate-900 text-xs font-semibold py-1 px-2.5 rounded-full flex items-center gap-1 shadow max-w-[90%] truncate pointer-events-auto">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{getDomain(destinationUrl)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Meta Section */}
            <div className="p-3">
              <h4 className="text-sm font-bold text-slate-200 line-clamp-2 leading-tight">
                {title || 'Pin Title Placeholder'}
              </h4>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs text-slate-400 font-medium truncate">
                  {accountNickname}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Detail Dialog View */
          <div className="max-w-[700px] w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[420px]">
            {/* Image Column */}
            <div className="w-full md:w-1/2 bg-slate-950 aspect-[2/3] md:aspect-auto flex items-center justify-center border-r border-slate-850">
              {localImageSrc ? (
                <img
                  src={localImageSrc}
                  alt={altText || 'Pin image'}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6 text-slate-600">
                  <p className="text-sm">No Image uploaded</p>
                </div>
              )}
            </div>

            {/* Info Column */}
            <div className="w-full md:w-1/2 p-8 flex flex-col justify-between gap-6">
              <div className="flex flex-col gap-4">
                {/* Board selector simulator header */}
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3">
                  <span>Draft Review</span>
                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                    Pinterest Layout
                  </span>
                </div>

                {/* Destination link badge */}
                {destinationUrl && (
                  <a
                    href={destinationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-pinterest-red underline transition-colors self-start bg-slate-800/40 px-3 py-1.5 rounded-full border border-slate-700/60"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{getDomain(destinationUrl)}</span>
                  </a>
                )}

                {/* Title */}
                <h2 className="text-2xl font-bold text-slate-100 leading-tight">
                  {title || 'Add your title here'}
                </h2>

                {/* Description */}
                <p className="text-sm text-slate-350 leading-relaxed whitespace-pre-wrap">
                  {description || 'This is where your Pin description will appear. Tell everyone what your Pin is about.'}
                </p>
              </div>

              {/* Creator details */}
              <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-auto">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-200 leading-tight">
                      {accountNickname}
                    </h5>
                    <p className="text-[10px] text-slate-500">Creator Account</p>
                  </div>
                </div>
                
                {altText && (
                  <div className="max-w-[120px] text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Alt Text</span>
                    <span className="text-xs text-slate-400 line-clamp-1" title={altText}>{altText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
