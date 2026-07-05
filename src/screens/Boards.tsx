import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Account, Board } from '../types';
import { 
  FolderHeart, RefreshCw, Search, Plus, Trash2, 
  ExternalLink, Check, Star 
} from 'lucide-react';
import { api } from '../services/api';

interface BoardsProps {
  accounts: Account[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Boards: React.FC<BoardsProps> = ({
  accounts,
  onShowToast
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [boards, setBoards] = useState<Board[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(null);

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
      // Toggle off if already default
      const newDefault = defaultBoardId === boardId ? '' : boardId;
      await api.saveSetting(`defaultBoard:${selectedAccountId}`, newDefault);
      setDefaultBoardId(newDefault || null);
      onShowToast(newDefault ? 'Default board updated.' : 'Default board cleared.', 'success');
    } catch (e: any) {
      onShowToast(`Failed to save default board: ${e.message}`, 'error');
    }
  };

  const handleAddManualBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualUrl.trim() || !selectedAccountId) return;

    setIsSubmittingManual(true);
    try {
      // Simple validation
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
    if (confirm('Remove this board from your local database?')) {
      try {
        await api.deleteBoard(id);
        onShowToast('Board removed.', 'success');
        await loadBoards();
      } catch (e: any) {
        onShowToast(`Delete failed: ${e.message}`, 'error');
      }
    }
  };

  const filteredBoards = boards.filter((b) =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedAccountObj = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">BOARDS</h1>
          <p className="text-sm text-slate-400">Map and manage board locations for your accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedAccountId && (
            <Button
              variant="secondary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Board Manually
            </Button>
          )}
        </div>
      </div>

      {/* Account Selector & Search */}
      <div className="flex flex-col md:flex-row gap-4 bg-slate-950/20 p-4 border border-slate-800 rounded-2xl">
        <div className="flex flex-col gap-1.5 md:w-1/3">
          <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Select Account</label>
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-slate-650"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.length === 0 && <option value="">No Accounts Available</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname} ({a.sessionStatus})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 md:flex-grow relative">
          <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Search Local Boards</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by board name..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {selectedAccountId && (
          <div className="flex flex-col justify-end md:w-auto">
            <Button
              variant="primary"
              icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={handleRefreshBoards}
              loading={isLoading}
              className="py-2.5"
            >
              Refresh Boards List
            </Button>
          </div>
        )}
      </div>

      {/* Boards List */}
      <Card title="Mapped Boards" subtitle={`Showing ${filteredBoards.length} boards for the selected account`}>
        {selectedAccountId === '' ? (
          <div className="text-center py-12 text-slate-500">
            Please add and select a Pinterest account first to view boards.
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-950/5">
            <FolderHeart className="w-10 h-10 text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-450">No Mapped Boards Found</p>
            <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
              If automatic loading fails or you have a private board, you can map it manually.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Board Manually
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredBoards.map((board) => {
              const isDefault = defaultBoardId === board.id;
              return (
                <div
                  key={board.id}
                  className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl hover:bg-slate-900/75 transition-all"
                >
                  <div className="min-w-0 flex-grow">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-200 truncate">{board.name}</h4>
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 bg-amber-950/60 border border-amber-900/40 text-amber-400 text-[9px] uppercase font-black px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <a
                      href={board.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-500 hover:text-pinterest-red transition-colors inline-flex items-center gap-1 mt-1 truncate max-w-[90%]"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{board.url}</span>
                    </a>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetDefault(board.id)}
                      icon={<Star className={`w-4 h-4 ${isDefault ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />}
                      title={isDefault ? 'Clear default' : 'Set as default board'}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteBoard(board.id)}
                      icon={<Trash2 className="w-4 h-4 text-slate-500 hover:text-rose-400" />}
                      title="Delete board mapping"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
              Save Board
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddManualBoard} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Board Name</label>
            <input
              type="text"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-slate-650"
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-655 focus:outline-none focus:border-slate-650"
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
