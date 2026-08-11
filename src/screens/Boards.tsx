import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Account, Board, QueueJob } from '../types';
import { 
  FolderHeart, RefreshCw, Search, Plus, Trash2, 
  ExternalLink, Check, Star, LayoutGrid, List,
  Copy, Layers, Globe, Sparkles, Shield, Tag
} from 'lucide-react';
import { api } from '../services/api';

interface BoardsProps {
  accounts: Account[];
  queue?: QueueJob[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Boards: React.FC<BoardsProps> = ({
  accounts,
  queue = [],
  onShowToast
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [boards, setBoards] = useState<Board[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Manual board inputs
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Initialize selected account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      const firstConnected = accounts.find(a => a.sessionStatus === 'connected');
      setSelectedAccountId(firstConnected ? firstConnected.id : accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Load boards when account selection changes
  const loadBoards = async () => {
    if (!selectedAccountId) return;
    try {
      const data = await api.getBoards(selectedAccountId);
      setBoards(data);
      
      // Load default board setting
      const settings = await api.getSettings();
      setDefaultBoardId(settings[`defaultBoard:${selectedAccountId}`] || null);
    } catch (e: any) {
      console.error('Failed to load boards:', e);
    }
  };

  useEffect(() => {
    loadBoards();
  }, [selectedAccountId]);

  const handleRefreshBoards = async () => {
    if (!selectedAccountId) return;
    setIsLoading(true);
    onShowToast('Fetching Pinterest boards... Please wait.', 'info');
    try {
      await api.fetchBoardsFromPinterest(selectedAccountId);
      onShowToast('Boards list updated successfully!', 'success');
      await loadBoards();
    } catch (e: any) {
      onShowToast(`Scraping failed: ${e.message}. You can still add boards manually below.`, 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (boardId: string) => {
    if (!selectedAccountId) return;
    try {
      const newDefault = defaultBoardId === boardId ? '' : boardId;
      await api.saveSetting(`defaultBoard:${selectedAccountId}`, newDefault);
      setDefaultBoardId(newDefault || null);
      onShowToast(newDefault ? 'Default board updated.' : 'Default board cleared.', 'success');
    } catch (e: any) {
      onShowToast(`Failed to save default board: ${e.message}`, 'error');
    }
  };

  const handleCopyUrl = async (url: string, boardId: string) => {
    try {
      await api.writeToClipboard(url);
      setCopiedId(boardId);
      onShowToast('Board URL copied to clipboard!', 'info');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e: any) {
      onShowToast('Failed to copy URL', 'error');
    }
  };

  const handleAddManualBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualUrl.trim() || !selectedAccountId) return;

    setIsSubmittingManual(true);
    try {
      if (!manualUrl.includes('pinterest.com/')) {
        throw new Error('Board URL must be a valid Pinterest board link (e.g. https://www.pinterest.com/username/board-name/).');
      }

      await api.saveBoard({
        accountId: selectedAccountId,
        name: manualName.trim(),
        url: manualUrl.trim()
      });

      onShowToast('Board added manually.', 'success');
      setManualName('');
      setManualUrl('');
      setIsAddModalOpen(false);
      await loadBoards();
    } catch (e: any) {
      onShowToast(e.message, 'error');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteBoard = async (id: string) => {
    if (confirm('Remove this board mapping from your local database?')) {
      try {
        await api.deleteBoard(id);
        onShowToast('Board removed.', 'success');
        await loadBoards();
      } catch (e: any) {
        onShowToast(`Delete failed: ${e.message}`, 'error');
      }
    }
  };

  // Get pin count published to each board from queue
  const getPinCountForBoard = (boardName: string): number => {
    if (!selectedAccountId) return 0;
    return queue.filter(q => 
      q.accountId === selectedAccountId && 
      q.boardName?.toLowerCase() === boardName.toLowerCase() &&
      q.status === 'completed'
    ).length;
  };

  // Generate dynamic cover gradient based on string hash
  const getCoverGradient = (name: string) => {
    const gradients = [
      'linear-gradient(135deg, #e60023 0%, #800014 100%)',
      'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
      'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
      'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)',
      'linear-gradient(135deg, #d97706 0%, #78350f 100%)',
      'linear-gradient(135deg, #db2777 0%, #831843 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const filteredBoards = boards.filter((b) =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedAccountObj = accounts.find(a => a.id === selectedAccountId);
  const defaultBoardObj = boards.find(b => b.id === defaultBoardId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
              Pinterest Boards
            </h1>
            <span style={{ 
              fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
              background: 'rgba(230,0,35,0.15)', color: '#f87171', border: '1px solid rgba(230,0,35,0.3)',
              display: 'inline-flex', alignItems: 'center', gap: 4
            }}>
              <FolderHeart className="w-3.5 h-3.5" /> Visual Board Mapping
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            Map target Pinterest boards, set default publish destinations, and organize account targets.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: 3
          }}>
            <button
              onClick={() => setViewMode('grid')}
              title="Visual Grid View"
              style={{
                padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: viewMode === 'grid' ? 'rgba(230,0,35,0.2)' : 'transparent',
                color: viewMode === 'grid' ? '#f87171' : 'rgba(255,255,255,0.4)',
                fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease'
              }}>
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Compact List View"
              style={{
                padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: viewMode === 'list' ? 'rgba(230,0,35,0.2)' : 'transparent',
                color: viewMode === 'list' ? '#f87171' : 'rgba(255,255,255,0.4)',
                fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease'
              }}>
              <List className="w-4 h-4" /> List
            </button>
          </div>

          {selectedAccountId && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                color: '#fff', fontWeight: 800, fontSize: 13,
                transition: 'all 0.15s ease'
              }}>
              <Plus className="w-4 h-4" /> Add Board Manually
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* Selected Account Card */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #e60023, #ad081b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 16
          }}>
            {selectedAccountObj ? selectedAccountObj.nickname.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Active Account Profile</span>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginTop: 2 }}>
              {selectedAccountObj ? selectedAccountObj.nickname : 'None Selected'}
            </div>
          </div>
        </div>

        {/* Total Mapped Boards */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Layers className="w-5 h-5" style={{ color: '#818cf8' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Mapped Boards</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>
              {boards.length} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>boards</span>
            </div>
          </div>
        </div>

        {/* Default Destination Board */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Star className="w-5 h-5" style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Default Board</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: defaultBoardObj ? '#f59e0b' : 'rgba(255,255,255,0.4)', marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {defaultBoardObj ? defaultBoardObj.name : 'Not set'}
            </div>
          </div>
        </div>
      </div>

      {/* Account Selector & Search Bar */}
      <div style={{
        padding: '16px 20px', borderRadius: 16,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end'
      }}>
        {/* Account Selector */}
        <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
            Target Account Profile
          </label>
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-slate-650"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.length === 0 && <option value="">No Accounts Available</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname} ({a.sessionStatus === 'connected' ? 'Connected' : 'Disconnected'})
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
            Filter Boards
          </label>
          <div style={{ position: 'relative' }}>
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by board name or URL..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Sync Button */}
        {selectedAccountId && (
          <button
            onClick={handleRefreshBoards}
            disabled={isLoading}
            style={{
              padding: '10px 18px', borderRadius: 12, cursor: isLoading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #e60023, #ad081b)', border: 'none',
              color: '#fff', fontWeight: 800, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(230,0,35,0.3)',
              opacity: isLoading ? 0.6 : 1
            }}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Syncing...' : 'Sync Boards'}
          </button>
        )}
      </div>

      {/* Boards Content View */}
      {selectedAccountId === '' ? (
        <div style={{ 
          textAlign: 'center', padding: '64px 24px',
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 20, color: 'rgba(255,255,255,0.4)'
        }}>
          Please add and select a Pinterest account profile to view mapped boards.
        </div>
      ) : filteredBoards.length === 0 ? (
        <div style={{ 
          textAlign: 'center', padding: '64px 24px',
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 20
        }}>
          <FolderHeart className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.6)', margin: '0 0 6px' }}>No Mapped Boards Found</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', maxWidth: 360, margin: '0 auto 20px' }}>
            Sync boards automatically from Pinterest or add a private/custom board link manually.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 13
            }}>
            Add Board Manually
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Visual Board Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {filteredBoards.map((board) => {
            const isDefault = defaultBoardId === board.id;
            const publishedCount = getPinCountForBoard(board.name);
            const coverGradient = getCoverGradient(board.name);

            return (
              <div key={board.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${isDefault ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 20, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'transform 0.2s ease, border-color 0.2s ease',
                boxShadow: isDefault ? '0 0 30px rgba(245,158,11,0.04) inset' : 'none'
              }}>
                <div>
                  {/* Board Visual Cover Banner */}
                  <div style={{
                    height: 100, background: coverGradient,
                    padding: '14px 16px', position: 'relative',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    overflow: 'hidden'
                  }}>
                    {/* Background Pattern overlay */}
                    <div style={{
                      position: 'absolute', inset: 0, opacity: 0.15,
                      backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                      backgroundSize: '16px 16px'
                    }} />

                    {/* Top Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
                      <span style={{ 
                        fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 12,
                        background: 'rgba(0,0,0,0.4)', color: '#fff', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        <Tag className="w-3 h-3 text-red-400" /> Pinterest Board
                      </span>

                      {isDefault && (
                        <span style={{ 
                          fontSize: 10, fontWeight: 900, padding: '3px 9px', borderRadius: 12,
                          background: 'rgba(245,158,11,0.9)', color: '#000',
                          display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 2px 8px rgba(245,158,11,0.5)'
                        }}>
                          <Star className="w-3 h-3 fill-black text-black" /> DEFAULT TARGET
                        </span>
                      )}
                    </div>

                    {/* Board Initials Icon */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, zIndex: 1 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 12,
                        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 900, fontSize: 16, backdropFilter: 'blur(8px)'
                      }}>
                        {board.name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Board Info Content */}
                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px', lineHeight: 1.3 }}>
                        {board.name}
                      </h3>
                      <a
                        href={board.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11, color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 4, wordBreak: 'break-all'
                        }}>
                        <ExternalLink className="w-3 h-3 flex-shrink-0 text-slate-500" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {board.url}
                        </span>
                      </a>
                    </div>

                    {/* Metrics Row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Pins Published:</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>
                        {publishedCount} pins
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div style={{
                  padding: '12px 18px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  {/* Set Default Toggle */}
                  <button
                    onClick={() => handleSetDefault(board.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 10, cursor: 'pointer',
                      background: isDefault ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isDefault ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: isDefault ? '#f59e0b' : 'rgba(255,255,255,0.6)',
                      fontWeight: 700, fontSize: 11,
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all 0.15s ease'
                    }}>
                    <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-amber-400 text-amber-400' : ''}`} />
                    {isDefault ? 'Default Board' : 'Set as Default'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Copy Link */}
                    <button
                      onClick={() => handleCopyUrl(board.url, board.id)}
                      title="Copy Board URL"
                      style={{
                        padding: '7px', borderRadius: 9, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: copiedId === board.id ? '#34d399' : 'rgba(255,255,255,0.5)',
                        display: 'flex', alignItems: 'center'
                      }}>
                      {copiedId === board.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    {/* External Link */}
                    <a
                      href={board.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in Pinterest"
                      style={{
                        padding: '7px', borderRadius: 9, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center'
                      }}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteBoard(board.id)}
                      title="Remove Board Mapping"
                      style={{
                        padding: '7px', borderRadius: 9, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        color: 'rgba(248,113,113,0.7)', display: 'flex', alignItems: 'center'
                      }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact List View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredBoards.map((board) => {
            const isDefault = defaultBoardId === board.id;
            return (
              <div
                key={board.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${isDefault ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 14
                }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h4 className="truncate" style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>
                      {board.name}
                    </h4>
                    {isDefault && (
                      <span style={{
                        fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 6,
                        background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)'
                      }}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <a
                    href={board.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3
                    }}>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.url}</span>
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleSetDefault(board.id)}
                    style={{
                      padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: isDefault ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700
                    }}>
                    <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-amber-400 text-amber-400' : ''}`} />
                    {isDefault ? 'Default' : 'Set Default'}
                  </button>

                  <button
                    onClick={() => handleDeleteBoard(board.id)}
                    style={{
                      padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                      color: 'rgba(248,113,113,0.7)', display: 'flex', alignItems: 'center'
                    }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Board Addition Modal */}
      <Modal
        isOpen={isAddModalOpen}
        title="Add Pinterest Board Manually"
        onClose={() => setIsAddModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} disabled={isSubmittingManual}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddManualBoard} loading={isSubmittingManual}>
              Save Board Mapping
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddManualBoard} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Board Name</label>
            <input
              type="text"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              placeholder="e.g. Dream Home Decor"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              disabled={isSubmittingManual}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Board URL</label>
            <input
              type="url"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              placeholder="e.g. https://www.pinterest.com/username/dream-home-decor/"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              disabled={isSubmittingManual}
              required
            />
            <p className="text-[10px] text-slate-500 leading-normal">
              Copy-paste the exact link of the board from your web browser. This URL is used to target the board select automation.
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
};
