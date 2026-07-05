import React, { useState, useRef } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Draft, Account, QueueJob } from '../types';
import { 
  FileText, Edit3, Copy, Trash2, 
  FileUp, FileDown, CheckSquare, Image,
  Search, Send, X, CheckCheck, Square
} from 'lucide-react';
import { api } from '../services/api';

interface DraftsProps {
  accounts: Account[];
  drafts: Draft[];
  onRefreshDrafts: () => Promise<void>;
  onEditDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => Promise<void>;
  onSaveDraft: (draft: Partial<Draft>) => Promise<Draft>;
  onAddQueueJob: (job: Partial<QueueJob>) => Promise<QueueJob>;
  onNavigate: (screen: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Drafts: React.FC<DraftsProps> = ({
  accounts,
  drafts,
  onRefreshDrafts,
  onEditDraft,
  onDeleteDraft,
  onSaveDraft,
  onAddQueueJob,
  onNavigate,
  onShowToast
}) => {
  const [importLoading, setImportLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pure JavaScript CSV Parser
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row = [''];
    let insideQuote = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
  };

  const filteredDrafts = drafts.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (d.title || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.imagePath || '').toLowerCase().includes(q)
    );
  });

  const allFilteredSelected = filteredDrafts.length > 0 && filteredDrafts.every(d => selectedIds.has(d.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDrafts.map(d => d.id)));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const filename = file.name.toLowerCase();

        const parsedDrafts: Partial<Draft>[] = [];

        if (filename.endsWith('.json')) {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) {
            throw new Error('JSON drafts file must be a list of objects.');
          }
          for (const item of data) {
            parsedDrafts.push({
              title: item.title || '',
              description: item.description || '',
              destinationUrl: item.destinationUrl || '',
              altText: item.altText || '',
              notes: item.notes || '',
              imagePath: item.imagePath || ''
            });
          }
        } else if (filename.endsWith('.csv')) {
          const rows = parseCSV(text);
          if (rows.length < 2) {
            throw new Error('CSV file is empty or missing header line.');
          }
          const headers = rows[0].map(h => h.trim().toLowerCase());
          const idxMap = {
            imagePath: headers.indexOf('image_path'),
            title: headers.indexOf('title'),
            description: headers.indexOf('description'),
            destinationUrl: headers.indexOf('destination_url'),
            altText: headers.indexOf('alt_text'),
            notes: headers.indexOf('notes')
          };
          if (idxMap.imagePath === -1) {
            throw new Error('CSV must contain an "image_path" column header.');
          }
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (row.length === 1 && row[0] === '') continue;
            parsedDrafts.push({
              imagePath: row[idxMap.imagePath] || '',
              title: idxMap.title !== -1 ? row[idxMap.title] || '' : '',
              description: idxMap.description !== -1 ? row[idxMap.description] || '' : '',
              destinationUrl: idxMap.destinationUrl !== -1 ? row[idxMap.destinationUrl] || '' : '',
              altText: idxMap.altText !== -1 ? row[idxMap.altText] || '' : '',
              notes: idxMap.notes !== -1 ? row[idxMap.notes] || '' : ''
            });
          }
        } else {
          throw new Error('Unsupported import file format. Use CSV or JSON.');
        }

        if (parsedDrafts.length > 0) {
          const resCount = await api.importDrafts(parsedDrafts);
          onShowToast(`Successfully imported ${resCount} draft templates!`, 'success');
          await onRefreshDrafts();
        } else {
          onShowToast('No draft items found to import.', 'warn');
        }
      } catch (e: any) {
        onShowToast(`Import failed: ${e.message}`, 'error');
      } finally {
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExportJSON = () => {
    if (drafts.length === 0) { onShowToast('No drafts available to export.', 'warn'); return; }
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(drafts, null, 2));
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `pinterest_drafts_${Date.now()}.json`);
      document.body.appendChild(a); a.click(); a.remove();
      onShowToast('JSON export started.', 'success');
    } catch (e: any) { onShowToast(`Export failed: ${e.message}`, 'error'); }
  };

  const handleExportCSV = () => {
    if (drafts.length === 0) { onShowToast('No drafts available to export.', 'warn'); return; }
    try {
      const escapeCell = (val: string) => {
        const clean = val ? String(val).replace(/"/g, '""') : '';
        if (clean.includes(',') || clean.includes('\n') || clean.includes('"')) return `"${clean}"`;
        return clean;
      };
      const csvHeaders = ['image_path', 'title', 'description', 'destination_url', 'alt_text', 'notes'];
      const csvLines = [csvHeaders.join(',')];
      for (const d of drafts) {
        csvLines.push([
          escapeCell(d.imagePath), escapeCell(d.title), escapeCell(d.description),
          escapeCell(d.destinationUrl), escapeCell(d.altText), escapeCell(d.notes)
        ].join(','));
      }
      const csvStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvLines.join('\n'));
      const a = document.createElement('a');
      a.setAttribute("href", csvStr);
      a.setAttribute("download", `pinterest_drafts_${Date.now()}.csv`);
      document.body.appendChild(a); a.click(); a.remove();
      onShowToast('CSV export started.', 'success');
    } catch (e: any) { onShowToast(`Export failed: ${e.message}`, 'error'); }
  };

  const handleDuplicateDraft = async (draft: Draft) => {
    try {
      await onSaveDraft({
        title: `${draft.title} (Copy)`,
        description: draft.description,
        destinationUrl: draft.destinationUrl,
        altText: draft.altText,
        notes: draft.notes,
        imagePath: draft.imagePath
      });
      onShowToast('Draft duplicated successfully.', 'success');
      await onRefreshDrafts();
    } catch (e: any) { onShowToast(`Failed to duplicate: ${e.message}`, 'error'); }
  };

  const handleConvertToQueue = async (draft: Draft) => {
    try {
      const draftAccountId = draft.accountId && accounts.find(a => a.id === draft.accountId)?.id;
      const connected = accounts.find(a => a.sessionStatus === 'connected');
      const accountId = draftAccountId || (connected ? connected.id : (accounts[0] ? accounts[0].id : ''));
      if (!accountId) { onShowToast('Connect a Pinterest account first to add to queue.', 'warn'); return; }

      let targetBoardName = draft.boardName || 'Pinterest Pins';
      let targetBoardUrl = draft.boardUrl || '';
      if (!draft.boardUrl) {
        const settings = await api.getSettings();
        const defaultBoardId = settings[`defaultBoard:${accountId}`];
        const boards = await api.getBoards(accountId);
        const defaultBoard = boards.find(b => b.id === defaultBoardId) || boards[0];
        if (defaultBoard) { targetBoardName = defaultBoard.name; targetBoardUrl = defaultBoard.url; }
      }

      await onAddQueueJob({
        accountId, boardName: targetBoardName, boardUrl: targetBoardUrl,
        imagePath: draft.imagePath, title: draft.title, description: draft.description,
        destinationUrl: draft.destinationUrl, altText: draft.altText, notes: draft.notes,
        scheduledDate: draft.scheduledDate || null, scheduledTime: draft.scheduledTime || null,
        status: 'pending'
      });
      onShowToast('Draft loaded into Queue successfully!', 'success');
    } catch (e: any) { onShowToast(`Failed to enqueue: ${e.message}`, 'error'); }
  };

  // Bulk actions
  const handleBulkQueue = async () => {
    const selected = drafts.filter(d => selectedIds.has(d.id));
    if (selected.length === 0) return;
    setBulkLoading(true);
    let count = 0;
    for (const draft of selected) {
      try { await handleConvertToQueue(draft); count++; } catch {}
    }
    onShowToast(`Queued ${count} of ${selected.length} drafts.`, 'success');
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  const handleBulkDelete = async () => {
    const selected = drafts.filter(d => selectedIds.has(d.id));
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} selected draft(s) permanently?`)) return;
    setBulkLoading(true);
    let count = 0;
    for (const draft of selected) {
      try { await onDeleteDraft(draft.id); count++; } catch {}
    }
    onShowToast(`Deleted ${count} drafts.`, 'success');
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight gradient-text">
            📋 DRAFTS & TEMPLATES
          </h1>
          {drafts.length > 0 && (
            <span className="bg-violet-500/15 text-violet-400 border border-violet-500/20 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {drafts.length}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            className="hidden"
            accept=".csv,.json"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<FileUp className="w-3.5 h-3.5" />}
            onClick={() => fileInputRef.current?.click()}
            loading={importLoading}
          >
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<FileDown className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
          >
            CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportJSON}
          >
            JSON
          </Button>
        </div>
      </div>

      {/* Search + Select All Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            className="w-full bg-slate-950/60 border border-slate-800/60 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
            placeholder="Search drafts by title, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {filteredDrafts.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
          >
            {allFilteredSelected ? <CheckCheck className="w-4 h-4 text-violet-400" /> : <Square className="w-4 h-4" />}
            {allFilteredSelected ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Drafts Grid */}
      {filteredDrafts.length === 0 ? (
        <div className="text-center py-20 text-slate-500 border border-dashed border-slate-800/60 rounded-2xl bg-slate-950/10">
          <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-400">
            {searchQuery ? 'No drafts match your search' : 'No Drafts Saved'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'Try different keywords.' : 'Save drafts using the Pin Composer or import a bulk CSV.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDrafts.map((draft) => {
            const localImageSrc = draft.imagePath ? `media:///${draft.imagePath.replace(/\\/g, '/')}` : '';
            const isSelected = selectedIds.has(draft.id);
            return (
              <div
                key={draft.id}
                className={`group relative flex flex-col bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-slate-950/50 ${
                  isSelected 
                    ? 'border-violet-500/40 ring-1 ring-violet-500/20 shadow-lg shadow-violet-950/20' 
                    : 'border-slate-800/60 hover:border-slate-700/60'
                }`}
              >
                {/* Selection Checkbox */}
                <button
                  onClick={() => toggleSelect(draft.id)}
                  className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    isSelected 
                      ? 'bg-violet-500 text-white shadow-md' 
                      : 'bg-slate-950/70 backdrop-blur-sm text-slate-500 border border-slate-700/60 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isSelected ? <CheckCheck className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
                </button>

                {/* Image Preview */}
                <div className="w-full h-48 bg-slate-950/80 flex items-center justify-center overflow-hidden">
                  {localImageSrc ? (
                    <img
                      src={localImageSrc}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-700">
                      <Image className="w-8 h-8" />
                      <span className="text-[10px] font-medium">No Image</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-grow p-4 gap-2">
                  <h4 className="text-sm font-semibold text-slate-200 line-clamp-1" title={draft.title || 'Untitled'}>
                    {draft.title || <span className="italic text-slate-550">Untitled Draft</span>}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px]" title={draft.description}>
                    {draft.description || <span className="italic text-slate-600">No description.</span>}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate mt-auto" title={draft.imagePath}>
                    {draft.imagePath ? draft.imagePath.split(/[\\/]/).pop() : 'No image'}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-2 pt-3 border-t border-slate-800/40">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Send className="w-3 h-3" />}
                      onClick={() => handleConvertToQueue(draft)}
                      className="px-2.5 py-1 text-[10px]"
                      title="Add to Queue"
                    >
                      Queue
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Edit3 className="w-3 h-3" />}
                      onClick={() => onEditDraft(draft)}
                      className="px-2 py-1 text-[10px]"
                      title="Edit"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy className="w-3 h-3" />}
                      onClick={() => handleDuplicateDraft(draft)}
                      className="px-2 py-1 text-[10px]"
                      title="Duplicate"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="w-3 h-3 text-slate-550 group-hover:text-rose-400" />}
                      onClick={async () => {
                        if (confirm('Delete this draft permanently?')) {
                          try {
                            await onDeleteDraft(draft.id);
                            onShowToast('Draft deleted.', 'success');
                          } catch (e: any) {
                            onShowToast(`Failed to delete: ${e.message}`, 'error');
                          }
                        }
                      }}
                      className="px-2 py-1 text-[10px] ml-auto hover:bg-rose-950/20"
                      title="Delete"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900/95 backdrop-blur-xl border border-violet-500/30 rounded-2xl px-6 py-3 shadow-2xl shadow-violet-950/30 animate-fade-in">
          <span className="text-sm font-bold text-violet-300">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-6 bg-slate-700" />
          <Button
            variant="ai"
            size="sm"
            icon={<Send className="w-3.5 h-3.5" />}
            onClick={handleBulkQueue}
            loading={bulkLoading}
          >
            Queue Selected
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={handleBulkDelete}
            loading={bulkLoading}
          >
            Delete Selected
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-1 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
