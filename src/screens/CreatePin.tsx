import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PreviewCard } from '../components/PreviewCard';
import { Modal } from '../components/Modal';
import { Account, Board, Draft, QueueJob } from '../types';
import { 
  Image as ImageIcon, Sparkles, AlertCircle, Plus, 
  Save, Send, Info, Tag, RefreshCw, X, FileSpreadsheet,
  Layers, Settings2, FileText, CheckCircle2, ListChecks, UploadCloud, Check,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { SeoAudit } from '../components/SeoAudit';

interface CreatePinProps {
  accounts: Account[];
  drafts: Draft[];
  onSaveDraft: (draft: Partial<Draft>) => Promise<Draft>;
  onAddQueueJob: (job: Partial<QueueJob>) => Promise<QueueJob>;
  onNavigate: (screen: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
  editingDraft: Draft | null;
  clearEditingDraft: () => void;
}

export const CreatePin: React.FC<CreatePinProps> = ({
  accounts,
  drafts,
  onSaveDraft,
  onAddQueueJob,
  onNavigate,
  onShowToast,
  editingDraft,
  clearEditingDraft
}) => {
  // Tab selection
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Pin Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [notes, setNotes] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imageSizeError, setImageSizeError] = useState('');

  // Target Selections
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountBoards, setAccountBoards] = useState<Record<string, { boardName: string; boardUrl: string }>>({});
  const [boardsData, setBoardsData] = useState<Record<string, Board[]>>({});

  // AI Assistant Panel
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiKeyword, setAiKeyword] = useState('');
  const [aiTone, setAiTone] = useState('Conversational');
  const [aiAudience, setAiAudience] = useState('General');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTitles, setAiTitles] = useState<string[]>([]);
  const [aiDescriptions, setAiDescriptions] = useState<string[]>([]);
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [aiAltText, setAiAltText] = useState('');
  const [aiValidationWarnings, setAiValidationWarnings] = useState<string[]>([]);

  // Bulk Importer States
  const [bulkSpreadsheetPath, setBulkSpreadsheetPath] = useState('');
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<string[][]>([]);
  const [bulkImages, setBulkImages] = useState<{ name: string; path: string; size: number }[]>([]);
  const [matchingMethod, setMatchingMethod] = useState<'sequential' | 'filename'>('sequential');
  const [columnMapping, setColumnMapping] = useState({ title: '', description: '', url: '', altText: '', filename: '' });
  const [isParsing, setIsParsing] = useState(false);
  const [matchedItems, setMatchedItems] = useState<{
    imagePath: string;
    filename: string;
    title: string;
    description: string;
    destinationUrl: string;
    altText: string;
    status: 'ready' | 'missing_title' | 'missing_image';
    rowIdx: number;
    scheduledDate?: string;
    scheduledTime?: string;
    batchBoardName?: string;
    batchBoardUrl?: string;
  }[]>([]);
  const [sheetDragActive, setSheetDragActive] = useState(false);
  const [imagesDragActive, setImagesDragActive] = useState(false);

  const [bulkAiMode, setBulkAiMode] = useState(false);
  const [bulkDefaultUrl, setBulkDefaultUrl] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  const [bulkScheduleMode, setBulkScheduleMode] = useState(false);
  const [bulkScheduleDays, setBulkScheduleDays] = useState('1');
  const [bulkScheduleStartTime, setBulkScheduleStartTime] = useState('09:00');
  const [bulkScheduleEndTime, setBulkScheduleEndTime] = useState('18:00');
  const [boardSearchQuery, setBoardSearchQuery] = useState<Record<string, string>>({});

  // Multi-Batch System: each batch = images + board + destinationUrl
  type BulkBatch = {
    id: string;
    images: { name: string; path: string; size: number }[];
    boardName: string;
    boardUrl: string;
    destinationUrl: string;
  };
  const [bulkBatches, setBulkBatches] = useState<BulkBatch[]>([]);
  const [stagingImages, setStagingImages] = useState<{ name: string; path: string; size: number }[]>([]);
  const [stagingBoardUrl, setStagingBoardUrl] = useState('');
  const [stagingBoardName, setStagingBoardName] = useState('');
  const [stagingDestinationUrl, setStagingDestinationUrl] = useState('');
  const stagingImageInputRef = useRef<HTMLInputElement>(null);

  const parseBoardUrlToName = (url: string): string => {
    try {
      const cleaned = url.trim().replace(/\/$/, ""); // remove trailing slash
      const parts = cleaned.split('/');
      const lastPart = parts[parts.length - 1] || 'Custom Board';
      return lastPart
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    } catch {
      return 'Custom Board';
    }
  };

  // Publish Dialog Confirm
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkSheetInputRef = useRef<HTMLInputElement>(null);
  const bulkImageInputRef = useRef<HTMLInputElement>(null);

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
          i++; // Skip double quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip LF in CRLF
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

  // Load drafts if editing
  const prevEditingRef = useRef<Draft | null | undefined>(undefined);
  useEffect(() => {
    // Only act if editingDraft actually changed (not just re-renders)
    if (prevEditingRef.current === editingDraft) return;
    prevEditingRef.current = editingDraft;
    
    if (editingDraft) {
      setTitle(editingDraft.title);
      setDescription(editingDraft.description);
      setDestinationUrl(editingDraft.destinationUrl);
      setAltText(editingDraft.altText);
      setNotes(editingDraft.notes);
      setImagePath(editingDraft.imagePath);
      setActiveTab('single');
    }
  }, [editingDraft]);

  // Auto-select connected accounts when accounts list loads/changes
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      // Auto-select all connected accounts, or first account if none connected
      const connected = accounts.filter(a => a.sessionStatus === 'connected').map(a => a.id);
      if (connected.length > 0) {
        setSelectedAccountIds(connected);
      } else {
        setSelectedAccountIds([accounts[0].id]);
      }
    }
  }, [accounts]);

  // Load AI Settings
  useEffect(() => {
    api.getSettings().then((settings) => {
      setAiEnabled(settings.aiEnabled === true);
    });
  }, []);

  // Load Boards list for selected accounts (tries DB cache first, then live Pinterest fetch)
  useEffect(() => {
    const fetchBoardsForAccounts = async () => {
      const data: Record<string, Board[]> = {};
      const mappings: Record<string, { boardName: string; boardUrl: string }> = { ...accountBoards };
      const settings = await api.getSettings();

      for (const accId of selectedAccountIds) {
        try {
          // 1. Try reading from local DB cache first
          let list = await api.getBoards(accId);
          
          // 2. If DB cache is empty, try live fetch from Pinterest
          if ((!list || list.length === 0)) {
            try {
              console.log(`No cached boards for ${accId}, attempting live Pinterest fetch...`);
              const liveBoards = await api.fetchBoardsFromPinterest(accId);
              if (liveBoards && liveBoards.length > 0) {
                list = liveBoards;
                console.log(`Live fetched ${liveBoards.length} boards for ${accId}`);
              }
            } catch (fetchErr) {
              console.warn(`Live board fetch failed for ${accId}:`, fetchErr);
            }
          }
          
          data[accId] = list || [];
          
          if (!mappings[accId] || !mappings[accId].boardUrl) {
            const defaultId = settings[`defaultBoard:${accId}`];
            const defaultBoard = list.find((b) => b.id === defaultId);
            if (defaultBoard) {
              mappings[accId] = { boardName: defaultBoard.name, boardUrl: defaultBoard.url };
            } else if (list.length > 0) {
              mappings[accId] = { boardName: list[0].name, boardUrl: list[0].url };
            } else {
              mappings[accId] = { boardName: '', boardUrl: '' };
            }
          }
        } catch (e) {
          console.error(`Failed to fetch boards for account ${accId}:`, e);
          data[accId] = [];
        }
      }
      setBoardsData(data);
      setAccountBoards(mappings);
    };

    if (selectedAccountIds.length > 0) {
      fetchBoardsForAccounts();
    }
  }, [selectedAccountIds]);

  // Handle local image file picker (Single Mode)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const path = (file as any).path;
    if (!path) {
      onShowToast('Could not resolve absolute local path of the image.', 'error');
      return;
    }

    const ext = path.split('.').pop()?.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      onShowToast('Unsupported file type. Please pick a JPG, JPEG, PNG, or WEBP image.', 'error');
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width < 200 || img.height < 200) {
        setImageSizeError(`Dimensions warning: ${img.width}x${img.height}px is very small. Pinterest recommends at least 600x900px (2:3 aspect ratio).`);
      } else {
        setImageSizeError('');
      }
      setImagePath(path);
      URL.revokeObjectURL(img.src);
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const path = (file as any).path;
    if (!path) return;

    const ext = path.split('.').pop()?.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      onShowToast('Unsupported file format.', 'error');
      return;
    }

    setImagePath(path);
  };

  const handleToggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBoardChange = (accountId: string, boardIdOrUrl: string) => {
    const list = boardsData[accountId] || [];
    const board = list.find(b => b.id === boardIdOrUrl || b.url === boardIdOrUrl);
    
    if (board) {
      setAccountBoards((prev) => ({
        ...prev,
        [accountId]: { boardName: board.name, boardUrl: board.url }
      }));
    } else {
      setAccountBoards((prev) => ({
        ...prev,
        [accountId]: { boardName: boardIdOrUrl.split('/').filter(Boolean).pop() || 'Manual Board', boardUrl: boardIdOrUrl }
      }));
    }
  };

  // Form Validation (Single Mode)
  const validateForm = (): boolean => {
    if (!imagePath) {
      onShowToast('Please pick a local image to publish.', 'warn');
      return false;
    }
    if (selectedAccountIds.length === 0) {
      onShowToast('Select at least one Pinterest account to target.', 'warn');
      return false;
    }
    
    for (const accId of selectedAccountIds) {
      const mapping = accountBoards[accId];
      if (!mapping || !mapping.boardUrl) {
        const accName = accounts.find(a => a.id === accId)?.nickname || 'Account';
        onShowToast(`Please assign a target board for: ${accName}`, 'warn');
        return false;
      }
    }
    return true;
  };

  // Save Draft Action (Single Mode)
  const handleSaveDraft = async () => {
    try {
      const firstAccId = selectedAccountIds[0];
      const boardMapping = firstAccId ? accountBoards[firstAccId] : null;
      const payload: Partial<Draft> = {
        title,
        description,
        destinationUrl,
        altText,
        notes,
        imagePath,
        accountId: firstAccId || null,
        boardName: boardMapping ? boardMapping.boardName : null,
        boardUrl: boardMapping ? boardMapping.boardUrl : null
      };

      if (editingDraft) {
        payload.id = editingDraft.id;
        payload.createdAt = editingDraft.createdAt;
      }

      await onSaveDraft(payload);
      onShowToast('Draft saved successfully.', 'success');
      
      if (editingDraft) {
        clearEditingDraft();
        onNavigate('drafts');
      }
    } catch (e: any) {
      onShowToast(`Failed to save draft: ${e.message}`, 'error');
    }
  };

  // Queue Pin Action (Single Mode)
  const handleAddToQueue = async () => {
    if (!validateForm()) return;

    try {
      for (const accId of selectedAccountIds) {
        const boardMapping = accountBoards[accId];
        await onAddQueueJob({
          accountId: accId,
          boardName: boardMapping.boardName,
          boardUrl: boardMapping.boardUrl,
          imagePath,
          title,
          description,
          destinationUrl,
          altText,
          notes,
          status: 'pending'
        });
      }
      onShowToast(`Added ${selectedAccountIds.length} pin job(s) to publisher queue.`, 'success');
      
      if (editingDraft) clearEditingDraft();
      onNavigate('queue');
    } catch (e: any) {
      onShowToast(`Queue error: ${e.message}`, 'error');
    }
  };

  // Direct Publish Action (Single Mode)
  const handleDirectPublish = async () => {
    if (!validateForm()) return;
    setIsPublishConfirmOpen(true);
  };

  const executeDirectPublish = async () => {
    setIsPublishConfirmOpen(false);
    try {
      const addedJobIds: string[] = [];
      for (const accId of selectedAccountIds) {
        const boardMapping = accountBoards[accId];
        const job = await onAddQueueJob({
          accountId: accId,
          boardName: boardMapping.boardName,
          boardUrl: boardMapping.boardUrl,
          imagePath,
          title,
          description,
          destinationUrl,
          altText,
          notes,
          status: 'pending'
        });
        addedJobIds.push(job.id);
      }
      
      if (editingDraft) clearEditingDraft();
      onNavigate('queue');
      onShowToast('Queue loaded. Starting direct publishing...', 'info');
      await api.startQueueExecution(addedJobIds);
    } catch (e: any) {
      onShowToast(`Publish error: ${e.message}`, 'error');
    }
  };

  // AI assistance trigger (Single Mode)
  const runAIAssistant = async (action: string) => {
    if (action === 'analyzeImage') {
      if (!imagePath) {
        onShowToast('Please select a local image file first.', 'warn');
        return;
      }
    } else {
      if (!aiTopic.trim()) {
        onShowToast('Enter a Pin topic/keyword to use AI Assist.', 'warn');
        return;
      }
    }

    setAiLoading(true);
    try {
      // Get the current board name for context
      const firstAccId = selectedAccountIds[0];
      const currentBoardName = firstAccId ? (accountBoards[firstAccId]?.boardName || '') : '';

      if (action === 'analyzeImage') {
        onShowToast('Analyzing image with AI Vision + board context...', 'info');
        const res = await api.callAI('analyzeImage', { 
          imagePath, 
          boardName: currentBoardName,
          topic: aiTopic || currentBoardName
        });
        if (res) {
          if (res.title) setTitle(res.title);
          if (res.description) setDescription(res.description);
          if (res.altText) setAltText(res.altText);
          onShowToast('AI Vision Analysis complete! Title, Description, and Alt Text populated.', 'success');
        }
        return;
      }

      const payload = {
        topic: aiTopic,
        keyword: aiKeyword,
        title,
        description,
        imageNotes: notes,
        tone: aiTone,
        audience: aiAudience,
        destinationUrl,
        boardName: currentBoardName
      };

      if (action === 'titles') {
        const res = await api.callAI('generateTitleSuggestions', payload);
        setAiTitles(res || []);
      } else if (action === 'descriptions') {
        const res = await api.callAI('generateDescriptionSuggestions', payload);
        setAiDescriptions(res || []);
      } else if (action === 'altText') {
        const res = await api.callAI('improveAltText', payload);
        setAltText(res || '');
      } else if (action === 'keywords') {
        const res = await api.callAI('generateKeywords', payload);
        setAiKeywords(res || []);
      } else if (action === 'validate') {
        const res = await api.callAI('validatePinMetadata', payload);
        setAiValidationWarnings(res.warnings || []);
        if (res.isValid) {
          onShowToast('AI Validation passed! Perfect metadata.', 'success');
        } else {
          onShowToast('AI warnings found. Please review.', 'warn');
        }
      }
    } catch (e: any) {
      onShowToast(`AI Call failed: ${e.message}`, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // --- Bulk Importer Functions ---
  const handleSheetDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setSheetDragActive(true);
    } else if (e.type === "dragleave") {
      setSheetDragActive(false);
    }
  };

  const handleSheetDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSheetDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const path = (file as any).path;
    if (!path) {
      onShowToast('Could not resolve absolute path of spreadsheet.', 'error');
      return;
    }

    parseSpreadsheet(file, path);
  };

  const handleBulkSheetSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const path = (file as any).path;
    if (!path) {
      onShowToast('Could not resolve absolute path of spreadsheet.', 'error');
      return;
    }

    parseSpreadsheet(file, path);
  };

  const parseSpreadsheet = (file: File, path: string) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const filename = file.name.toLowerCase();
        let headers: string[] = [];
        let rows: string[][] = [];

        if (filename.endsWith('.json')) {
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > 0) {
            headers = Object.keys(data[0]);
            rows = data.map((item: any) => headers.map(h => String(item[h] || '')));
          } else {
            throw new Error('JSON file must be a non-empty array of objects.');
          }
        } else if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
          const parsed = parseCSV(text);
          if (parsed.length > 0) {
            headers = parsed[0].map(h => h.trim());
            rows = parsed.slice(1);
          } else {
            throw new Error('Spreadsheet file appears to be empty.');
          }
        } else {
          onShowToast('Unsupported file format. Please use Excel CSV or JSON.', 'error');
          return;
        }

        setBulkHeaders(headers);
        setBulkRows(rows);
        setBulkSpreadsheetPath(path);

        const newMapping = { title: '', description: '', url: '', altText: '', filename: '' };
        headers.forEach((h) => {
          const name = h.toLowerCase();
          if (name.includes('title') || name === 'name') newMapping.title = h;
          else if (name.includes('description') || name.includes('desc')) newMapping.description = h;
          else if (name.includes('url') || name.includes('link') || name.includes('destination')) newMapping.url = h;
          else if (name.includes('alt') || name.includes('alt_text')) newMapping.altText = h;
          else if (name.includes('filename') || name.includes('image') || name.includes('file')) newMapping.filename = h;
        });
        setColumnMapping(newMapping);
        onShowToast(`Spreadsheet loaded. Found ${rows.length} items.`, 'success');
      } catch (e: any) {
        onShowToast(`Failed to parse: ${e.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleImagesDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setImagesDragActive(true);
    } else if (e.type === "dragleave") {
      setImagesDragActive(false);
    }
  };

  const handleImagesDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImagesDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      loadImages(files);
    }
  };

  const handleBulkImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadImages(files);
    }
  };

  const loadImages = (files: FileList) => {
    const list: typeof bulkImages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = (file as any).path;
      if (path) {
        const ext = path.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
          list.push({
            name: file.name,
            path,
            size: file.size
          });
        }
      }
    }
    setBulkImages(prev => {
      const combined = [...prev, ...list];
      const unique = combined.filter((v, idx, a) => a.findIndex(t => t.path === v.path) === idx);
      onShowToast(`Imported ${list.length} images. Total selected: ${unique.length}`, 'info');
      return unique;
    });
  };

  /**
   * Smart cross-account schedule calculator.
   * When multiple accounts are selected, each account gets an automatic time offset
   * so no two accounts ever post at the same time.
   * 
   * @param idx - Pin index within this account's batch
   * @param total - Total pins for this account
   * @param accountOffset - Minutes offset for this account (0, 15, 30 for accounts 1, 2, 3)
   * @param totalAccounts - Number of accounts (for gap calculation)
   */
  const calculateSchedule = (idx: number, total: number, accountOffset: number = 0, totalAccounts: number = 1) => {
    if (!bulkScheduleMode) return { date: undefined as string | undefined, time: undefined as string | undefined };
    const days = parseInt(bulkScheduleDays) || 1;
    const pinsPerDay = Math.ceil(total / days);
    const dayOffset = Math.floor(idx / pinsPerDay) + 1; // Start tomorrow

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const schedDate = `${yyyy}-${mm}-${dd}`;

    const [startHour, startMin] = bulkScheduleStartTime.split(':').map(Number);
    const [endHour, endMin] = bulkScheduleEndTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const minutesRange = endMinutes - startMinutes;
    const pinIndexInDay = idx % pinsPerDay;
    
    // Calculate interval — divide the time range by pins, leaving room for account gaps
    const effectiveRange = minutesRange - (totalAccounts * 5); // Reserve 5 min per account for gaps
    const intervalMinutes = pinsPerDay > 1 ? Math.floor(effectiveRange / (pinsPerDay - 1)) : effectiveRange;

    // Base time + account offset + small random jitter (0-3 min) for natural look
    const jitter = Math.floor(Math.random() * 4);
    const timeInMinutes = Math.min(
      startMinutes + pinIndexInDay * intervalMinutes + accountOffset + jitter,
      endMinutes - 1 // Never exceed end time
    );
    
    const hr = Math.floor(timeInMinutes / 60);
    const mn = Math.floor(timeInMinutes % 60);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr % 12 === 0 ? 12 : hr % 12;
    const schedTime = `${String(displayHr).padStart(2, '0')}:${String(mn).padStart(2, '0')} ${ampm}`;

    return { date: schedDate, time: schedTime };
  };

  useEffect(() => {

    if (bulkAiMode) {
      // Multi-batch mode: build items from all batches
      if (bulkBatches.length > 0) {
        const allImages: { name: string; path: string; size: number; boardName: string; boardUrl: string; destinationUrl: string }[] = [];
        for (const batch of bulkBatches) {
          for (const img of batch.images) {
            allImages.push({ 
              ...img, 
              boardName: batch.boardName, 
              boardUrl: batch.boardUrl, 
              destinationUrl: batch.destinationUrl 
            });
          }
        }
        if (allImages.length === 0) {
          setMatchedItems([]);
          return;
        }
        const items = allImages.map((img, idx) => {
          const cleanedName = img.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const sched = calculateSchedule(idx, allImages.length);
          return {
            imagePath: img.path,
            filename: img.name,
            title: `AI: [Auto Title for "${cleanedName}"]`,
            description: `AI: [Auto Description for "${cleanedName}"]`,
            destinationUrl: img.destinationUrl || bulkDefaultUrl,
            altText: `AI Alt Text for "${cleanedName}"`,
            status: 'ready' as const,
            rowIdx: idx,
            scheduledDate: sched.date,
            scheduledTime: sched.time,
            batchBoardName: img.boardName,
            batchBoardUrl: img.boardUrl
          };
        });
        setMatchedItems(items);
        return;
      }

      // Legacy flat mode fallback (no batches)
      if (bulkImages.length === 0) {
        setMatchedItems([]);
        return;
      }
      const items = bulkImages.map((img, idx) => {
        const cleanedName = img.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        const sched = calculateSchedule(idx, bulkImages.length);
        return {
          imagePath: img.path,
          filename: img.name,
          title: `AI: [Auto Title for "${cleanedName}"]`,
          description: `AI: [Auto Description for "${cleanedName}"]`,
          destinationUrl: bulkDefaultUrl,
          altText: `AI Alt Text for "${cleanedName}"`,
          status: 'ready' as const,
          rowIdx: idx,
          scheduledDate: sched.date,
          scheduledTime: sched.time
        };
      });
      setMatchedItems(items);
      return;
    }

    if (bulkRows.length === 0) {
      setMatchedItems([]);
      return;
    }

    const titleColIdx = bulkHeaders.indexOf(columnMapping.title);
    const descColIdx = bulkHeaders.indexOf(columnMapping.description);
    const urlColIdx = bulkHeaders.indexOf(columnMapping.url);
    const altColIdx = bulkHeaders.indexOf(columnMapping.altText);
    const fileColIdx = bulkHeaders.indexOf(columnMapping.filename);

    const items: typeof matchedItems = [];

    if (matchingMethod === 'sequential') {
      bulkRows.forEach((row, idx) => {
        const titleVal = titleColIdx !== -1 ? row[titleColIdx] : '';
        const descVal = descColIdx !== -1 ? row[descColIdx] : '';
        const urlVal = urlColIdx !== -1 ? row[urlColIdx] : '';
        const altVal = altColIdx !== -1 ? row[altColIdx] : '';
        
        const img = bulkImages[idx];
        const status = !titleVal ? 'missing_title' : (!img ? 'missing_image' : 'ready');
        const sched = calculateSchedule(idx, bulkRows.length);

        items.push({
          imagePath: img ? img.path : '',
          filename: img ? img.name : 'No image matched',
          title: titleVal,
          description: descVal,
          destinationUrl: urlVal,
          altText: altVal,
          status,
          rowIdx: idx,
          scheduledDate: sched.date,
          scheduledTime: sched.time
        });
      });
    } else {
      bulkRows.forEach((row, idx) => {
        const titleVal = titleColIdx !== -1 ? row[titleColIdx] : '';
        const descVal = descColIdx !== -1 ? row[descColIdx] : '';
        const urlVal = urlColIdx !== -1 ? row[urlColIdx] : '';
        const altVal = altColIdx !== -1 ? row[altColIdx] : '';
        const fileVal = fileColIdx !== -1 ? row[fileColIdx].toLowerCase().trim() : '';

        let matchedImg = bulkImages.find(img => img.name.toLowerCase() === fileVal);
        if (!matchedImg && fileVal) {
          matchedImg = bulkImages.find(img => img.name.toLowerCase().includes(fileVal) || fileVal.includes(img.name.toLowerCase()));
        }

        const status = !titleVal ? 'missing_title' : (!matchedImg ? 'missing_image' : 'ready');
        const sched = calculateSchedule(idx, bulkRows.length);

        items.push({
          imagePath: matchedImg ? matchedImg.path : '',
          filename: matchedImg ? matchedImg.name : (fileVal || 'No filename in row'),
          title: titleVal,
          description: descVal,
          destinationUrl: urlVal,
          altText: altVal,
          status,
          rowIdx: idx,
          scheduledDate: sched.date,
          scheduledTime: sched.time
        });
      });
    }

    setMatchedItems(items);
  }, [
    bulkRows, bulkImages, columnMapping, matchingMethod, bulkAiMode, bulkDefaultUrl,
    bulkScheduleMode, bulkScheduleDays, bulkScheduleStartTime, bulkScheduleEndTime,
    bulkBatches
  ]);

  const resetBulkState = () => {
    setBulkSpreadsheetPath('');
    setBulkHeaders([]);
    setBulkRows([]);
    setBulkImages([]);
    setMatchedItems([]);
    setBulkBatches([]);
    setStagingImages([]);
    setStagingBoardUrl('');
    setStagingBoardName('');
    setStagingDestinationUrl('');
    if (bulkSheetInputRef.current) bulkSheetInputRef.current.value = '';
    if (bulkImageInputRef.current) bulkImageInputRef.current.value = '';
    if (stagingImageInputRef.current) stagingImageInputRef.current.value = '';
  };

  // Staging helpers for multi-batch
  const handleStagingImagesDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setImagesDragActive(true);
    } else if (e.type === "dragleave") {
      setImagesDragActive(false);
    }
  };

  const handleStagingImagesDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImagesDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) loadStagingImages(files);
  };

  const handleStagingImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) loadStagingImages(files);
  };

  const loadStagingImages = (files: FileList) => {
    const list: typeof stagingImages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fpath = (file as any).path;
      if (fpath) {
        const ext = fpath.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
          list.push({ name: file.name, path: fpath, size: file.size });
        }
      }
    }
    setStagingImages(prev => {
      const combined = [...prev, ...list];
      return combined.filter((v, idx, a) => a.findIndex(t => t.path === v.path) === idx);
    });
  };

  const commitBatch = () => {
    if (stagingImages.length === 0) {
      onShowToast('Add images to this batch first.', 'warn');
      return;
    }
    if (!stagingBoardUrl) {
      onShowToast('Select a target board for this batch.', 'warn');
      return;
    }
    const newBatch: BulkBatch = {
      id: Date.now().toString(),
      images: [...stagingImages],
      boardName: stagingBoardName,
      boardUrl: stagingBoardUrl,
      destinationUrl: stagingDestinationUrl.trim()
    };
    setBulkBatches(prev => [...prev, newBatch]);
    setStagingImages([]);
    setStagingBoardUrl('');
    setStagingBoardName('');
    setStagingDestinationUrl('');
    if (stagingImageInputRef.current) stagingImageInputRef.current.value = '';
    onShowToast(`Batch added: ${newBatch.images.length} images → "${newBatch.boardName}"`, 'success');
  };

  const removeBatch = (batchId: string) => {
    setBulkBatches(prev => prev.filter(b => b.id !== batchId));
    onShowToast('Batch removed.', 'info');
  };

  const handleBulkImportToDrafts = async () => {
    const validItems = matchedItems.filter(item => item.status === 'ready' || item.status === 'missing_image');
    if (validItems.length === 0) {
      onShowToast('No valid items found to save as drafts.', 'warn');
      return;
    }

    setIsParsing(true);
    try {
      const draftsToImport = [];

      if (bulkAiMode) {
        setBulkProgress({ current: 0, total: validItems.length, message: 'Starting AI metadata generation...' });

        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          const cleanedName = item.filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

          setBulkProgress({
            current: i + 1,
            total: validItems.length,
            message: `Generating AI Title and Description for draft ${i + 1} of ${validItems.length}: "${cleanedName}"...`
          });

          // Use per-item batch board if available, else fall back to account board
          const firstAccId = selectedAccountIds[0];
          const itemBoardName = item.batchBoardName || (firstAccId ? (accountBoards[firstAccId]?.boardName || 'Pinterest Pins') : 'Pinterest Pins');
          const itemBoardUrl = item.batchBoardUrl || '';

          const payload = {
            topic: itemBoardName,
            keyword: cleanedName,
            tone: 'Inspirational',
            audience: 'General Pinterest users',
            imageNotes: cleanedName,
            boardName: itemBoardName
          };

          let aiTitle = '';
          let aiDesc = '';
          let aiAlt = '';

          try {
            const seo = await api.callAI('generateSEOComplete', payload);
            aiTitle = seo?.title || `Beautiful ${cleanedName}`;
            aiDesc = seo?.description || `Explore more about ${cleanedName}! Save this pin for later.`;
            aiAlt = seo?.altText || `Visual representation of ${cleanedName}`;
          } catch (aiErr) {
            console.error('AI generation failed for draft, using fallback:', aiErr);
            aiTitle = cleanedName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            aiDesc = `Discover inspiration about ${cleanedName}. Check out our board for more details.`;
            aiAlt = `Image showing ${cleanedName}`;
          }

          draftsToImport.push({
            title: aiTitle,
            description: aiDesc,
            destinationUrl: item.destinationUrl || '',
            altText: aiAlt,
            notes: `Bulk AI Import → ${itemBoardName}`,
            imagePath: item.imagePath,
            accountId: firstAccId || null,
            boardName: itemBoardName,
            boardUrl: itemBoardUrl || null,
            scheduledDate: item.scheduledDate || null,
            scheduledTime: item.scheduledTime || null
          });
        }
      } else {
        // Standard Excel import
        const firstAccId = selectedAccountIds[0];
        const boardMapping = firstAccId ? accountBoards[firstAccId] : null;
        for (const item of validItems) {
          draftsToImport.push({
            title: item.title,
            description: item.description,
            destinationUrl: item.destinationUrl,
            altText: item.altText,
            notes: 'Bulk Excel Import',
            imagePath: item.imagePath,
            accountId: firstAccId || null,
            boardName: boardMapping ? boardMapping.boardName : null,
            boardUrl: boardMapping ? boardMapping.boardUrl : null,
            scheduledDate: item.scheduledDate || null,
            scheduledTime: item.scheduledTime || null
          });
        }
      }

      const count = await api.importDrafts(draftsToImport);
      onShowToast(`Successfully imported ${count} draft templates!`, 'success');
      resetBulkState();
      onNavigate('drafts');
    } catch (e: any) {
      onShowToast(`Bulk import failed: ${e.message}`, 'error');
    } finally {
      setIsParsing(false);
      setBulkProgress(null);
    }
  };

  const handleBulkAddToQueue = async (runNow: boolean = false) => {
    const readyItems = matchedItems.filter(item => item.status === 'ready');
    if (readyItems.length === 0) {
      onShowToast('No ready items (must have Title and Matched Image) found to queue.', 'warn');
      return;
    }
    if (selectedAccountIds.length === 0) {
      onShowToast('Select at least one Pinterest account to target.', 'warn');
      return;
    }

    // In batch mode, each item carries its own board — skip global board validation
    const hasBatchBoards = bulkBatches.length > 0;
    if (!hasBatchBoards) {
      for (const accId of selectedAccountIds) {
        const mapping = accountBoards[accId];
        if (!mapping || !mapping.boardUrl) {
          const accName = accounts.find(a => a.id === accId)?.nickname || 'Account';
          onShowToast(`Assign a target board for: ${accName}`, 'warn');
          return;
        }
      }
    }

    setIsParsing(true);
    try {
      let jobsCreated = 0;
      const addedJobIds: string[] = [];

      if (bulkAiMode) {
        setBulkProgress({ current: 0, total: readyItems.length, message: 'Starting AI metadata generation...' });

        for (let i = 0; i < readyItems.length; i++) {
          const item = readyItems[i];
          const cleanedName = item.filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

          setBulkProgress({
            current: i + 1,
            total: readyItems.length,
            message: `Generating AI Title and Description for image ${i + 1} of ${readyItems.length}: "${cleanedName}"...`
          });

          // Use per-item batch board when available
          const firstAccId = selectedAccountIds[0];
          const itemBoardName = item.batchBoardName || accountBoards[firstAccId]?.boardName || 'Pinterest Pins';

          const payload = {
            topic: itemBoardName,
            keyword: cleanedName,
            tone: 'Inspirational',
            audience: 'General Pinterest users',
            imageNotes: cleanedName
          };

          let aiTitle = '';
          let aiDesc = '';
          let aiAlt = '';

          try {
            // Call AI
            const seo = await api.callAI('generateSEOComplete', payload);
            aiTitle = seo?.title || `Beautiful ${cleanedName}`;
            aiDesc = seo?.description || `Explore more about ${cleanedName}! Save this pin for later.`;
            aiAlt = seo?.altText || `Visual representation of ${cleanedName}`;
          } catch (aiErr: any) {
            console.error('AI generation failed for item, using fallback:', aiErr);
            aiTitle = cleanedName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            aiDesc = `Discover inspiration about ${cleanedName}. Check out our board for more details.`;
            aiAlt = `Image showing ${cleanedName}`;
          }

          // Cross-account scheduling: each account gets a 15-minute offset
          for (let accIdx = 0; accIdx < selectedAccountIds.length; accIdx++) {
            const accId = selectedAccountIds[accIdx];
            const accBoard = accountBoards[accId] || { boardName: '', boardUrl: '' };
            const useBoardName = item.batchBoardName || accBoard.boardName;
            const useBoardUrl = item.batchBoardUrl || accBoard.boardUrl;
            const accountOffset = accIdx * 15; // 15 min gap between accounts
            const sched = bulkScheduleMode
              ? calculateSchedule(i, readyItems.length, accountOffset, selectedAccountIds.length)
              : { date: item.scheduledDate, time: item.scheduledTime };
            
            const job = await onAddQueueJob({
              accountId: accId,
              boardName: useBoardName,
              boardUrl: useBoardUrl,
              imagePath: item.imagePath,
              title: aiTitle,
              description: aiDesc,
              destinationUrl: item.destinationUrl || '',
              altText: aiAlt,
              notes: `Bulk AI → ${useBoardName}`,
              status: 'pending',
              scheduledDate: sched.date || null,
              scheduledTime: sched.time || null
            });
            addedJobIds.push(job.id);
            jobsCreated++;
          }
        }

        setBulkProgress(null);
      } else {
        // Standard Excel import with cross-account scheduling
        for (let itemIdx = 0; itemIdx < readyItems.length; itemIdx++) {
          const item = readyItems[itemIdx];
          for (let accIdx = 0; accIdx < selectedAccountIds.length; accIdx++) {
            const accId = selectedAccountIds[accIdx];
            const boardMapping = accountBoards[accId];
            const accountOffset = accIdx * 15; // 15 min gap between accounts
            const sched = bulkScheduleMode
              ? calculateSchedule(itemIdx, readyItems.length, accountOffset, selectedAccountIds.length)
              : { date: item.scheduledDate, time: item.scheduledTime };

            const job = await onAddQueueJob({
              accountId: accId,
              boardName: boardMapping.boardName,
              boardUrl: boardMapping.boardUrl,
              imagePath: item.imagePath,
              title: item.title,
              description: item.description,
              destinationUrl: item.destinationUrl,
              altText: item.altText,
              notes: `Bulk CSV | Account ${accIdx + 1}/${selectedAccountIds.length} | Offset: +${accountOffset}min`,
              status: 'pending',
              scheduledDate: sched.date || null,
              scheduledTime: sched.time || null
            });
            addedJobIds.push(job.id);
            jobsCreated++;
          }
        }
      }

      resetBulkState();
      onNavigate('queue');

      if (runNow) {
        onShowToast(`Successfully enqueued ${jobsCreated} jobs. Starting direct publishing...`, 'info');
        await api.startQueueExecution(addedJobIds);
      } else {
        onShowToast(`Successfully enqueued ${jobsCreated} pin publishing jobs!`, 'success');
      }
    } catch (e: any) {
      onShowToast(`Bulk queueing failed: ${e.message}`, 'error');
    } finally {
      setIsParsing(false);
      setBulkProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight gradient-text">
            📌 {editingDraft ? 'EDIT PIN DRAFT' : 'PIN COMPOSER'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Craft perfect Pinterest pins with AI-powered SEO optimization.</p>
        </div>
        {editingDraft && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearEditingDraft();
              onNavigate('drafts');
            }}
          >
            Cancel Edit
          </Button>
        )}
      </div>

      {/* Mode Tabs */}
      {!editingDraft && (
        <div className="flex border-b border-slate-800 gap-1 mt-1">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'single'
                ? 'border-red-550 text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" /> Single Pin Composer
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'bulk'
                ? 'border-red-550 text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Bulk Excel/CSV Importer
          </button>
        </div>
      )}

      {/* Tab Panels */}
      {activeTab === 'single' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form Details */}
          <div className="xl:col-span-7 flex flex-col gap-6">
            {/* Media Selection */}
            <Card title="1. Select Pin Media" subtitle="JPG, JPEG, PNG, WEBP — Pinterest recommends 2:3 aspect ratio">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-300 upload-zone ${
                  imagePath 
                    ? 'border-emerald-700/40 bg-emerald-950/5 p-3' 
                    : 'border-slate-800/60 bg-slate-950/20 hover:border-violet-500/30 hover:bg-violet-950/5 p-8'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.webp"
                />
                
                {imagePath ? (
                  <div className="flex flex-col gap-3 text-left" onClick={(e) => e.stopPropagation()}>
                    <div className="relative w-full rounded-xl bg-slate-950/90 overflow-hidden flex items-center justify-center group min-h-[200px] max-h-[420px] border border-slate-800/40 shadow-lg shadow-slate-950/50">
                      <img
                        src={`media:///${imagePath.replace(/\\/g, '/')}`}
                        alt="Local Upload"
                        className="max-h-[400px] max-w-full object-contain rounded-lg transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                      {/* Gradient filename overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent p-3 pt-8">
                        <p className="text-xs font-medium text-slate-300 truncate">{imagePath.split(/[\\/]/).pop()}</p>
                      </div>
                      {/* Delete button — visible on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePath('');
                        }}
                        className="absolute top-3 right-3 bg-rose-600/80 hover:bg-rose-500 text-white rounded-full p-2 shadow-lg backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 flex items-center justify-center"
                        title="Remove Image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
                      <div className="min-w-0 flex-grow">
                        <p className="text-[10px] text-slate-500 font-mono truncate">{imagePath}</p>
                      </div>
                      
                      <Button
                        type="button"
                        size="sm"
                        variant="ai"
                        icon={<Sparkles className="w-3.5 h-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          runAIAssistant('analyzeImage');
                        }}
                        disabled={aiLoading}
                        className="py-1.5 px-3 text-xs font-bold whitespace-nowrap"
                      >
                        {aiLoading ? 'Scanning...' : '✨ AI Vision Scan'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4 text-slate-500">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/30 flex items-center justify-center mb-4">
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-300">Drag & Drop Your Pin Image</p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse • Best: 1000×1500px</p>
                  </div>
                )}
              </div>

              {imageSizeError && (
                <div className="mt-3 flex gap-2 text-xs text-amber-400 bg-amber-900/10 border border-amber-800/30 p-2.5 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{imageSizeError}</span>
                </div>
              )}
            </Card>

            {/* Form Fields */}
            <Card title="2. Pin Details" subtitle="Pinterest Metadata Specification">
              <div className="flex flex-col gap-4">
                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Pin Title</label>
                      <button
                        type="button"
                        onClick={() => runAIAssistant('titles')}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[9px] font-bold hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                        title="AI Generate Title Suggestions"
                      >
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </button>
                    </div>
                    <span className={`text-[10px] font-bold ${title.length > 100 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {title.length}/100
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={100}
                    className="w-full bg-slate-950/60 border border-slate-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
                    placeholder="e.g. Modern Kitchen Makeover Ideas 🏡"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Pin Description</label>
                      <button
                        type="button"
                        onClick={() => runAIAssistant('descriptions')}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[9px] font-bold hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                        title="AI Generate Description Suggestions"
                      >
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </button>
                    </div>
                    <span className={`text-[10px] font-bold ${description.length > 500 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {description.length}/500
                    </span>
                  </div>
                  <textarea
                    maxLength={500}
                    rows={4}
                    className="w-full bg-slate-950/60 border border-slate-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                    placeholder="Write a keyword-rich description with emojis and a call-to-action. End with #hashtags."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* Destination Link */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Destination Website Link</label>
                  <input
                    type="url"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-slate-650"
                    placeholder="e.g. https://myblog.com/kitchen-designs"
                    value={destinationUrl}
                    onChange={(e) => setDestinationUrl(e.target.value)}
                  />
                </div>

                {/* Grid Columns for Alt text & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Alt Text */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Alt Text (Screen Readers)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-slate-650"
                      placeholder="Describe what is visible in the image"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                    />
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Campaign Notes / Tags (Internal)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-slate-650"
                      placeholder="e.g. Summer launch, affiliate post"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Target Settings */}
            <Card title="3. Target Accounts & Pinterest Boards" subtitle="Select where this pin will be published">
              {accounts.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No accounts registered. Add a Pinterest account in the Accounts tab.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {accounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    const boardsList = boardsData[acc.id] || [];
                    const selection = accountBoards[acc.id] || { boardName: '', boardUrl: '' };

                    return (
                      <div key={acc.id} className="p-3 bg-slate-950/40 rounded-xl border border-slate-850 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`chk-${acc.id}`}
                            className="rounded border-slate-800 bg-slate-950 text-red-500 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                            checked={isSelected}
                            onChange={() => handleToggleAccount(acc.id)}
                          />
                          <label htmlFor={`chk-${acc.id}`} className="flex flex-col cursor-pointer">
                            <span className="text-xs font-bold text-slate-200">{acc.nickname}</span>
                            <span className="text-[10px] text-slate-350 font-mono capitalize">Status: {acc.sessionStatus}</span>
                          </label>
                        </div>                        {isSelected && (
                          <div className="w-full md:w-64 flex flex-col gap-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">Target Board</label>
                            {boardsList.length > 0 ? (
                              <>
                                <input
                                  type="text"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-0.5 mb-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none"
                                  placeholder="🔍 Search boards..."
                                  value={boardSearchQuery[acc.id] || ''}
                                  onChange={(e) => setBoardSearchQuery(prev => ({ ...prev, [acc.id]: e.target.value }))}
                                />
                                <select
                                  className="w-full border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                                  style={{ backgroundColor: '#020617', color: '#e2e8f0' }}
                                  value={boardsList.find(b => b.url === selection.boardUrl)?.id || selection.boardUrl}
                                  onChange={(e) => handleBoardChange(acc.id, e.target.value)}
                                >
                                  {boardsList
                                    .filter(b => b.name.toLowerCase().includes((boardSearchQuery[acc.id] || '').toLowerCase()))
                                    .map((b) => (
                                      <option key={b.id} value={b.id} style={{ backgroundColor: '#020617', color: '#e2e8f0' }}>{b.name}</option>
                                    ))
                                  }
                                </select>
                              </>
                            ) : (
                              <input
                                type="text"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                                placeholder="Paste Pinterest Board URL"
                                value={selection.boardUrl}
                                onChange={(e) => handleBoardChange(acc.id, e.target.value)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Action Bar */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                icon={<Save className="w-4 h-4" />}
                onClick={handleSaveDraft}
              >
                {editingDraft ? 'Update Template' : 'Save Draft Template'}
              </Button>
              <Button
                variant="secondary"
                icon={<Plus className="w-4 h-4" />}
                onClick={handleAddToQueue}
              >
                Add to Publish Queue
              </Button>
              <Button
                variant="primary"
                icon={<Send className="w-4 h-4" />}
                onClick={handleDirectPublish}
              >
                Publish Directly Now
              </Button>
            </div>
          </div>

          {/* Right Column: AI Assistant Panel */}
          <div className="xl:col-span-5 flex flex-col gap-6">
            {/* Visual Preview */}
            <PreviewCard
              title={title}
              description={description}
              imagePath={imagePath}
              destinationUrl={destinationUrl}
              altText={altText}
            />

            {/* Live SEO Score Checklist */}
            <SeoAudit
              title={title}
              description={description}
              altText={altText}
              destinationUrl={destinationUrl}
              imagePath={imagePath}
              boardName={selectedAccountIds[0] ? (accountBoards[selectedAccountIds[0]]?.boardName || '') : ''}
            />

            {/* AI Assistant */}
            <Card title="AI SEO Assistant" subtitle="Powered by Llama 4 Scout + OpenCode" accent>
                <div className="flex flex-col gap-4">
                  {!aiEnabled && (
                    <div className="flex items-center gap-3 bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
                      <Sparkles className="w-5 h-5 text-violet-400 flex-shrink-0" />
                      <div className="flex-grow">
                        <p className="text-xs font-bold text-violet-300">AI is not configured yet</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Add your Cloudflare API keys in Settings to unlock AI-powered SEO generation.</p>
                      </div>
                      <Button size="sm" variant="ai" onClick={() => onNavigate('settings')} className="text-[10px] px-3 py-1">
                        Settings
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Core Topic</label>
                      <input
                        type="text"
                        className="bg-slate-950/60 border border-slate-800/60 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                        placeholder="e.g. Kitchen makeover"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Keywords (Optional)</label>
                      <input
                        type="text"
                        className="bg-slate-950/60 border border-slate-800/60 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                        placeholder="e.g. modular, small cabinets"
                        value={aiKeyword}
                        onChange={(e) => setAiKeyword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Tone</label>
                      <select
                        className="bg-slate-950/60 border border-slate-800/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                      >
                        <option>Conversational</option>
                        <option>Professional</option>
                        <option>Inspirational</option>
                        <option>Educational</option>
                        <option>Clickbait/Urgent</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Target Audience</label>
                      <select
                        className="bg-slate-950/60 border border-slate-800/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                        value={aiAudience}
                        onChange={(e) => setAiAudience(e.target.value)}
                      >
                        <option>General</option>
                        <option>Homeowners</option>
                        <option>Crafters & DIYers</option>
                        <option>Designers & Architects</option>
                        <option>Moms & Families</option>
                      </select>
                    </div>
                  </div>

                  {/* AI Visual Analyser */}
                  {imagePath && (
                    <div className="border-t border-slate-800/40 pt-3">
                      <Button
                        size="sm"
                        variant="ai"
                        icon={<Sparkles className="w-4 h-4" />}
                        onClick={() => runAIAssistant('analyzeImage')}
                        disabled={aiLoading || !aiEnabled}
                        className="w-full py-2 text-xs font-bold"
                      >
                        ✨ AI Vision Scan — Auto-fill Title, Description & Alt Text
                      </Button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-800/40 pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Sparkles className="w-3 h-3 text-violet-400" />}
                      onClick={() => runAIAssistant('titles')}
                      disabled={aiLoading || !aiEnabled}
                      className="text-[10px] py-1.5"
                    >
                      Suggest Titles
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Sparkles className="w-3 h-3 text-violet-400" />}
                      onClick={() => runAIAssistant('descriptions')}
                      disabled={aiLoading || !aiEnabled}
                      className="text-[10px] py-1.5"
                    >
                      Suggest Descriptions
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Sparkles className="w-3 h-3 text-violet-400" />}
                      onClick={() => runAIAssistant('altText')}
                      disabled={aiLoading || !aiEnabled}
                      className="text-[10px] py-1.5"
                    >
                      Improve Alt Text
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Sparkles className="w-3.5 h-3.5 text-violet-400" />}
                      onClick={() => runAIAssistant('validate')}
                      disabled={aiLoading || !aiEnabled}
                      className="text-[10px] py-1.5"
                    >
                      Analyze Quality
                    </Button>
                  </div>

                  {/* AI Outputs */}
                  {aiLoading && (
                    <div className="flex items-center justify-center py-4 text-violet-400 text-xs gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing with AI model...
                    </div>
                  )}

                  {/* === PREMIUM AI SUGGESTION CARDS === */}

                  {aiTitles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa' }}>✨ Title Suggestions</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>click any card to apply</span>
                      </div>
                      {aiTitles.map((t, idx) => {
                        const charCount = t.length;
                        const isIdeal = charCount >= 40 && charCount <= 75;
                        return (
                          <button
                            key={idx}
                            onClick={() => { setTitle(t); onShowToast('✓ Title applied!', 'success'); }}
                            style={{
                              textAlign: 'left', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                              background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)',
                              transition: 'all 0.15s ease', width: '100%', display: 'flex',
                              flexDirection: 'column', gap: 4
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.35)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.04)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.15)'; }}
                          >
                            <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, lineHeight: 1.4 }}>{t}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 20,
                                background: isIdeal ? 'rgba(52,211,153,0.1)' : 'rgba(251,146,60,0.1)',
                                color: isIdeal ? '#34d399' : '#fb923c',
                                border: `1px solid ${isIdeal ? 'rgba(52,211,153,0.2)' : 'rgba(251,146,60,0.2)'}`
                              }}>{charCount} chars {isIdeal ? '✓ Ideal' : charCount < 40 ? '↑ Short' : '↓ Long'}</span>
                              <span style={{ fontSize: 9, color: 'rgba(139,92,246,0.5)', fontWeight: 700 }}>Click to Apply →</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {aiDescriptions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa' }}>✨ Description Suggestions</span>
                      </div>
                      {aiDescriptions.map((d, idx) => {
                        const charCount = d.length;
                        const isIdeal = charCount >= 150 && charCount <= 250;
                        return (
                          <button
                            key={idx}
                            onClick={() => { setDescription(d); onShowToast('✓ Description applied!', 'success'); }}
                            style={{
                              textAlign: 'left', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                              background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)',
                              transition: 'all 0.15s ease', width: '100%', display: 'flex',
                              flexDirection: 'column', gap: 4
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.35)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.04)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.15)'; }}
                          >
                            <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{d}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 20,
                                background: isIdeal ? 'rgba(52,211,153,0.1)' : 'rgba(251,146,60,0.1)',
                                color: isIdeal ? '#34d399' : '#fb923c',
                                border: `1px solid ${isIdeal ? 'rgba(52,211,153,0.2)' : 'rgba(251,146,60,0.2)'}`
                              }}>{charCount} chars {isIdeal ? '✓ Ideal' : charCount < 150 ? '↑ Too Short' : '↓ Too Long'}</span>
                              <span style={{ fontSize: 9, color: 'rgba(139,92,246,0.5)', fontWeight: 700 }}>Click to Apply →</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {aiAltText && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa' }}>✨ Alt Text Suggestion</span>
                      <button
                        onClick={() => { setAltText(aiAltText); onShowToast('✓ Alt text applied!', 'success'); }}
                        style={{
                          textAlign: 'left', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                          background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)',
                          transition: 'all 0.15s ease', width: '100%', display: 'flex', flexDirection: 'column', gap: 4
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.04)'; }}
                      >
                        <span style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.4 }}>{aiAltText}</span>
                        <span style={{ fontSize: 9, color: 'rgba(139,92,246,0.5)', fontWeight: 700 }}>{aiAltText.length} chars · Click to Apply →</span>
                      </button>
                    </div>
                  )}

                  {aiKeywords.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa' }}>✨ Keyword Cloud ({aiKeywords.length} keywords)</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {aiKeywords.map((kw, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              const currentDesc = description;
                              const kwLower = kw.toLowerCase();
                              if (!currentDesc.toLowerCase().includes(kwLower)) {
                                setDescription(currentDesc + (currentDesc ? ' ' : '') + '#' + kw.replace(/\s+/g, ''));
                                onShowToast(`Keyword "${kw}" added to description`, 'info');
                              } else {
                                onShowToast(`Keyword "${kw}" already in description`, 'info');
                              }
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                              color: '#a5b4fc', transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; }}
                            title={`Click to add #${kw.replace(/\s+/g, '')} to description`}
                          >
                            #{kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiValidationWarnings.length > 0 && (
                    <div style={{
                      padding: '12px 14px', borderRadius: 12, marginTop: 8,
                      background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
                      display: 'flex', flexDirection: 'column', gap: 6
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertCircle className="w-3.5 h-3.5" /> Quality Warnings
                      </span>
                      {aiValidationWarnings.map((w, idx) => (
                        <p key={idx} style={{ fontSize: 11, color: '#fca5a5', paddingLeft: 14, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 4 }}>•</span>{w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
          </div>
        </div>
      ) : (
        /* Bulk Importer Tab view */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Configuration Panel */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            
            {/* Bulk Mode Selection */}
            <Card title="Bulk Upload Mode">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-xs text-slate-200">AI Autogenerate Mode</span>
                    <span className="text-[10px] text-slate-500">Only upload images; AI writes title & description.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                    checked={bulkAiMode}
                    onChange={(e) => {
                      setBulkAiMode(e.target.checked);
                      resetBulkState();
                    }}
                  />
                </div>
              </div>
            </Card>            {bulkAiMode ? (
              <>
                {/* Multi-Batch Builder */}
                <Card title="1. Create Image Batches" subtitle="Select images → pick board → add batch. Repeat for different boards.">
                  <div className="flex flex-col gap-4">
                    {/* Staging: Select images for current batch */}
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 mb-1.5 block">Select Images for This Batch</label>
                      <div
                        onDragEnter={handleStagingImagesDrag}
                        onDragOver={handleStagingImagesDrag}
                        onDragLeave={handleStagingImagesDrag}
                        onDrop={handleStagingImagesDrop}
                        onClick={() => stagingImageInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-200 ${
                          stagingImages.length > 0 
                            ? 'border-emerald-800/60 bg-emerald-950/5' 
                            : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'
                        } ${imagesDragActive ? 'border-violet-500 bg-violet-950/10' : ''}`}
                      >
                        <input
                          type="file"
                          ref={stagingImageInputRef}
                          onChange={handleStagingImagesSelect}
                          className="hidden"
                          accept=".jpg,.jpeg,.png,.webp"
                          multiple
                        />
                        {stagingImages.length > 0 ? (
                          <div className="text-left text-xs text-slate-200">
                            <p className="font-bold flex items-center gap-1.5">
                              <ImageIcon className="w-4 h-4 text-emerald-500" />
                              {stagingImages.length} image(s) selected
                            </p>
                            <div className="grid grid-cols-5 gap-1.5 mt-2 max-h-[120px] overflow-y-auto">
                              {stagingImages.slice(0, 10).map((img, i) => (
                                <div key={i} className="aspect-square bg-slate-950 rounded-lg border border-slate-700/50 overflow-hidden" title={img.name}>
                                  <img src={`media:///${img.path.replace(/\\/g, '/')}`} alt={img.name} className="w-full h-full object-cover" />
                                </div>
                              ))}
                              {stagingImages.length > 10 && (
                                <div className="aspect-square bg-slate-900/60 rounded-lg border border-slate-700/50 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                                  +{stagingImages.length - 10}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setStagingImages([]); }}
                              className="text-[10px] text-rose-400 font-bold mt-2 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-2 text-slate-500">
                            <UploadCloud className="w-6 h-6 mb-1 text-slate-700" />
                            <p className="text-xs font-bold text-slate-400">Drop images here</p>
                            <p className="text-[10px] text-slate-600">or click to browse</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Staging: Pick board for this batch */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Assign Board for This Batch</label>
                      {(() => {
                        const firstAccId = selectedAccountIds[0];
                        const boardsList = firstAccId ? (boardsData[firstAccId] || []) : [];
                        return (
                          <div className="flex flex-col gap-2 text-xs">
                            {boardsList.length > 0 && (
                              <select
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500/50 appearance-none"
                                style={{ backgroundColor: '#0a0a0f', color: '#e2e8f0' }}
                                value={boardsList.some(b => b.url === stagingBoardUrl) ? stagingBoardUrl : ""}
                                onChange={(e) => {
                                  const url = e.target.value;
                                  if (url) {
                                    const board = boardsList.find(b => b.url === url);
                                    setStagingBoardUrl(url);
                                    setStagingBoardName(board?.name || '');
                                  } else {
                                    setStagingBoardUrl('');
                                    setStagingBoardName('');
                                  }
                                }}
                              >
                                <option value="">— Choose from Dropdown —</option>
                                {boardsList.map((b) => (
                                  <option key={b.url} value={b.url}>{b.name}</option>
                                ))}
                              </select>
                            )}
                            <input
                              type="text"
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-violet-500/50"
                              placeholder="Or Paste Custom Board URL"
                              value={stagingBoardUrl}
                              onChange={(e) => {
                                const url = e.target.value;
                                setStagingBoardUrl(url);
                                if (url.trim().startsWith('http') || url.includes('/')) {
                                  setStagingBoardName(parseBoardUrlToName(url));
                                } else {
                                  setStagingBoardName(url.trim());
                                }
                              }}
                            />
                            {stagingBoardName && (
                              <p className="text-[10px] text-violet-400 font-semibold italic">
                                Assigned Board Name: {stagingBoardName}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Staging: Destination URL for this batch */}
                    <div className="flex flex-col gap-1 text-xs">
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Destination URL for This Batch (Optional)</label>
                      <input
                        type="url"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-250 placeholder-slate-700 focus:outline-none focus:border-violet-500/50"
                        placeholder="e.g. https://mywebsite.com/niche-link"
                        value={stagingDestinationUrl}
                        onChange={(e) => setStagingDestinationUrl(e.target.value)}
                      />
                    </div>

                    {/* Commit batch button */}
                    <button
                      onClick={commitBatch}
                      disabled={stagingImages.length === 0 || !stagingBoardUrl}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        stagingImages.length > 0 && stagingBoardUrl
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20'
                          : 'bg-slate-900 text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-4 h-4" /> Add Batch ({stagingImages.length} images)
                    </button>

                    {/* Committed batches list */}
                    {bulkBatches.length > 0 && (
                      <div className="border-t border-slate-800 pt-3">
                        <p className="text-[9px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          {bulkBatches.length} Batch{bulkBatches.length > 1 ? 'es' : ''} Ready — {bulkBatches.reduce((sum, b) => sum + b.images.length, 0)} total images
                        </p>
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                          {bulkBatches.map((batch, bIdx) => (
                            <div key={batch.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 group hover:border-violet-500/30 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="bg-violet-500/15 text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">Batch {bIdx + 1}</span>
                                    <span className="text-slate-300 text-xs font-semibold truncate" title={batch.boardName}>{batch.boardName}</span>
                                  </div>
                                  {batch.destinationUrl && (
                                    <span className="text-[10px] text-blue-400/80 truncate pl-1 mt-0.5" title={batch.destinationUrl}>
                                      🔗 {batch.destinationUrl}
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeBatch(batch.id)}
                                  className="text-slate-600 hover:text-rose-400 transition-colors p-1 flex-shrink-0"
                                  title="Remove batch"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {batch.images.slice(0, 5).map((img, i) => (
                                  <div key={i} className="w-8 h-8 rounded-md overflow-hidden border border-slate-700/50 flex-shrink-0">
                                    <img src={`media:///${img.path.replace(/\\/g, '/')}`} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                                {batch.images.length > 5 && (
                                  <span className="text-[10px] text-slate-500 font-bold">+{batch.images.length - 5} more</span>
                                )}
                                <span className="ml-auto text-[10px] text-emerald-500/70 font-bold">{batch.images.length} 🖼</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Default Destination URL */}
                <Card title="2. Set Destination Website Link" subtitle="Default landing URL for generated pins">
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="text-[9px] uppercase font-bold text-slate-500">Destination URL</label>
                    <input
                      type="url"
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-slate-650"
                      placeholder="e.g. https://mywebsite.com"
                      value={bulkDefaultUrl}
                      onChange={(e) => setBulkDefaultUrl(e.target.value)}
                    />
                  </div>
                </Card>
              </>
            ) : (
              <>
                {/* Upload zones */}
                <Card title="1. Select Import Files" subtitle="Spreadsheets and target media images">
                  <div className="flex flex-col gap-4">
                    
                    {/* Spreadsheet zone */}
                    <div>
                      <label className="text-[10px] uppercase font-extrabold text-slate-455 tracking-wider mb-2 block">
                        Spreadsheet (Excel CSV / JSON)
                      </label>
                      <div
                        onDragEnter={handleSheetDrag}
                        onDragOver={handleSheetDrag}
                        onDragLeave={handleSheetDrag}
                        onDrop={handleSheetDrop}
                        onClick={() => bulkSheetInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                          bulkSpreadsheetPath 
                            ? 'border-emerald-800/60 bg-emerald-950/5' 
                            : 'border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-905/30'
                        } ${sheetDragActive ? 'border-red-500 bg-red-950/5' : ''}`}
                      >
                        <input
                          type="file"
                          ref={bulkSheetInputRef}
                          onChange={handleBulkSheetSelect}
                          className="hidden"
                          accept=".csv,.txt,.json"
                        />
                        {bulkSpreadsheetPath ? (
                          <div className="text-left text-xs text-slate-200">
                            <p className="font-bold truncate flex items-center gap-1.5">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              {bulkSpreadsheetPath.split(/[\\/]/).pop()}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">{bulkSpreadsheetPath}</p>
                            <p className="text-[10px] text-slate-450 mt-1 font-bold">Rows loaded: {bulkRows.length}</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-2 text-slate-500">
                            <UploadCloud className="w-7 h-7 mb-2 text-slate-700" />
                            <p className="text-xs font-bold text-slate-400">Drag spreadsheet here</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">or click to browse (.csv, .json)</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bulk images zone */}
                    <div>
                      <label className="text-[10px] uppercase font-extrabold text-slate-455 tracking-wider mb-2 block">
                        Select Media Images
                      </label>
                      <div
                        onDragEnter={handleImagesDrag}
                        onDragOver={handleImagesDrag}
                        onDragLeave={handleImagesDrag}
                        onDrop={handleImagesDrop}
                        onClick={() => bulkImageInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                          bulkImages.length > 0 
                            ? 'border-emerald-800/60 bg-emerald-950/5' 
                            : 'border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-955/30'
                        } ${imagesDragActive ? 'border-red-500 bg-red-950/5' : ''}`}
                      >
                        <input
                          type="file"
                          ref={bulkImageInputRef}
                          onChange={handleBulkImagesSelect}
                          className="hidden"
                          accept=".jpg,.jpeg,.png,.webp"
                          multiple
                        />
                        {bulkImages.length > 0 ? (
                          <div className="text-left text-xs text-slate-200">
                            <p className="font-bold flex items-center gap-1.5">
                              <ImageIcon className="w-4 h-4 text-emerald-500" />
                              {bulkImages.length} Image(s) loaded
                            </p>
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="grid grid-cols-5 gap-1 mt-2.5 max-h-[160px] overflow-y-auto pr-1"
                            >
                              {bulkImages.map((img, i) => (
                                <div key={i} className="aspect-square bg-slate-950 rounded border border-slate-850 overflow-hidden" title={img.name}>
                                  <img src={`media:///${img.path.replace(/\\/g, '/')}`} alt="" className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setBulkImages([]);
                              }}
                              className="text-[10px] text-rose-450 font-bold mt-2.5 block hover:underline"
                            >
                              Clear selected images
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-2 text-slate-500">
                            <UploadCloud className="w-7 h-7 mb-2 text-slate-700" />
                            <p className="text-xs font-bold text-slate-400">Select Multiple Images</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Drag-drop files in bulk</p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </Card>

                {/* Mapping configuration */}
                <Card title="2. Match Configurations" subtitle="Coordinate column headers to pin fields">
                  <div className="flex flex-col gap-4">
                    
                    {/* Matching rules */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Matching Mode</label>
                      <select
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-650"
                        value={matchingMethod}
                        onChange={(e) => setMatchingMethod(e.target.value as any)}
                      >
                        <option value="sequential">Sequential Match (Row 1 to Image 1)</option>
                        <option value="filename">Filename Column Match (Sheet name matches file)</option>
                      </select>
                      <p className="text-[10px] text-slate-550 leading-relaxed mt-1">
                        {matchingMethod === 'sequential' 
                          ? 'Matches spreadsheet rows to selected images strictly in the order they appear.'
                          : 'Requires a spreadsheet column detailing the image filename (e.g. kitchen.jpg).'}
                      </p>
                    </div>

                    {/* Mappings selection */}
                    {bulkHeaders.length > 0 && (
                      <div className="flex flex-col gap-3 border-t border-slate-850 pt-3">
                        <span className="text-[10px] uppercase font-extrabold text-slate-450 tracking-wider">Select Column Headers</span>
                        
                        {/* Title */}
                        <div className="grid grid-cols-2 items-center gap-2">
                          <span className="text-xs text-slate-355">Title:</span>
                          <select
                            className="bg-slate-955 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                            value={columnMapping.title}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, title: e.target.value }))}
                          >
                            <option value="">-- Ignore Column --</option>
                            {bulkHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        {/* Description */}
                        <div className="grid grid-cols-2 items-center gap-2">
                          <span className="text-xs text-slate-355">Description:</span>
                          <select
                            className="bg-slate-955 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                            value={columnMapping.description}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, description: e.target.value }))}
                          >
                            <option value="">-- Ignore Column --</option>
                            {bulkHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        {/* URL */}
                        <div className="grid grid-cols-2 items-center gap-2">
                          <span className="text-xs text-slate-355">Destination URL:</span>
                          <select
                            className="bg-slate-955 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                            value={columnMapping.url}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, url: e.target.value }))}
                          >
                            <option value="">-- Ignore Column --</option>
                            {bulkHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        {/* Alt Text */}
                        <div className="grid grid-cols-2 items-center gap-2">
                          <span className="text-xs text-slate-355">Alt Text:</span>
                          <select
                            className="bg-slate-955 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                            value={columnMapping.altText}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, altText: e.target.value }))}
                          >
                            <option value="">-- Ignore Column --</option>
                            {bulkHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        {/* Filename Column */}
                        {matchingMethod === 'filename' && (
                          <div className="grid grid-cols-2 items-center gap-2">
                            <span className="text-xs text-slate-355 font-bold text-red-400">Image Name:</span>
                            <select
                              className="bg-slate-955 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                              value={columnMapping.filename}
                              onChange={(e) => setColumnMapping(prev => ({ ...prev, filename: e.target.value }))}
                            >
                              <option value="">-- Select Column --</option>
                              {bulkHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}

            {/* Scheduling Options */}
            <Card title="Scheduling Options (Optional)" subtitle="Spread pins natively inside Pinterest">
              <div className="flex flex-col gap-4 text-xs">
                <div className="flex items-center justify-between bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-slate-200">Schedule Pins Natively</span>
                    <span className="text-[10px] text-slate-500">Auto-space and schedule directly in Pinterest</span>
                  </div>
                  <input
                    type="checkbox"
                    className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    checked={bulkScheduleMode}
                    onChange={(e) => setBulkScheduleMode(e.target.checked)}
                  />
                </div>

                {bulkScheduleMode && (
                  <div className="flex flex-col gap-3 border-t border-slate-850 pt-3 animate-fade-in">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Spread Over (Days)</label>
                      <input
                        type="number"
                        min="1"
                        max="14"
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none"
                        value={bulkScheduleDays}
                        onChange={(e) => setBulkScheduleDays(e.target.value)}
                      />
                      <p className="text-[9px] text-slate-600">Pinterest limits scheduling to 14 days in advance.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold text-slate-500">Start Time</label>
                        <input
                          type="time"
                          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none"
                          value={bulkScheduleStartTime}
                          onChange={(e) => setBulkScheduleStartTime(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold text-slate-500">End Time</label>
                        <input
                          type="time"
                          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none"
                          value={bulkScheduleEndTime}
                          onChange={(e) => setBulkScheduleEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Target Settings */}
            <Card title="3. Target Boards" subtitle="Select target publishing folders">
              {accounts.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-xs">
                  No accounts connected. Add account in Accounts tab.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {accounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    const boardsList = boardsData[acc.id] || [];
                    const selection = accountBoards[acc.id] || { boardName: '', boardUrl: '' };

                    return (
                      <div key={acc.id} className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-850 flex flex-col gap-2">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            id={`bulk-chk-${acc.id}`}
                            className="rounded border-slate-800 bg-slate-955 text-red-500 w-3.5 h-3.5 cursor-pointer"
                            checked={isSelected}
                            onChange={() => handleToggleAccount(acc.id)}
                          />
                          <label htmlFor={`bulk-chk-${acc.id}`} className="text-xs font-bold text-slate-200 cursor-pointer">
                            {acc.nickname}
                          </label>
                        </div>
                        {isSelected && (
                          <div>
                            {boardsList.length > 0 ? (
                              <>
                                <input
                                  type="text"
                                  className="w-full bg-slate-950 border border-slate-805 rounded px-2 py-0.5 mb-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none"
                                  placeholder="🔍 Search boards..."
                                  value={boardSearchQuery[acc.id] || ''}
                                  onChange={(e) => setBoardSearchQuery(prev => ({ ...prev, [acc.id]: e.target.value }))}
                                />
                                <select
                                  className="w-full border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                                  style={{ backgroundColor: '#020617', color: '#e2e8f0' }}
                                  value={boardsList.find(b => b.url === selection.boardUrl)?.id || selection.boardUrl}
                                  onChange={(e) => handleBoardChange(acc.id, e.target.value)}
                                >
                                  {boardsList
                                    .filter(b => b.name.toLowerCase().includes((boardSearchQuery[acc.id] || '').toLowerCase()))
                                    .map((b) => (
                                      <option key={b.id} value={b.id} style={{ backgroundColor: '#020617', color: '#e2e8f0' }}>{b.name}</option>
                                    ))
                                  }
                                </select>
                              </>
                            ) : (
                              <input
                                type="text"
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                                placeholder="Paste Board URL"
                                value={selection.boardUrl}
                                onChange={(e) => handleBoardChange(acc.id, e.target.value)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

          </div>

          {/* Right Column: Matched Preview Grid */}
          <div className="xl:col-span-8 flex flex-col gap-6">
            {bulkProgress && (
              <div style={{
                background: 'rgba(109,40,217,0.06)', border: '1px solid rgba(139,92,246,0.2)',
                padding: '16px 20px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 10
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#a78bfa' }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>AI Generating Metadata...</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                    border: '1px solid rgba(139,92,246,0.25)'
                  }}>{bulkProgress.current} / {bulkProgress.total} images</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, fontStyle: 'italic' }}>{bulkProgress.message}</p>
                <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7, #c084fc)',
                    height: '100%', borderRadius: 999,
                    width: `${Math.max(2, (bulkProgress.current / bulkProgress.total) * 100)}%`,
                    transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
                    boxShadow: '0 0 12px rgba(167,139,250,0.5)'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>GENERATING AI CONTENT</span>
                  <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 800 }}>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}% done</span>
                </div>
              </div>
            )}
            <Card
              title="4. Mapping Preview Grid"
              subtitle={`Simulated matches: ${matchedItems.length} rows`}
              headerAction={
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetBulkState}
                    disabled={matchedItems.length === 0 || isParsing}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBulkImportToDrafts}
                    disabled={matchedItems.length === 0 || isParsing}
                  >
                    Import to Drafts ({matchedItems.filter(i => i.status === 'ready' || i.status === 'missing_image').length})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleBulkAddToQueue(false)}
                    disabled={matchedItems.length === 0 || isParsing || selectedAccountIds.length === 0}
                  >
                    Add to Queue ({matchedItems.filter(i => i.status === 'ready').length})
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleBulkAddToQueue(true)}
                    disabled={matchedItems.length === 0 || isParsing || selectedAccountIds.length === 0}
                  >
                    Publish Directly Now ({matchedItems.filter(i => i.status === 'ready').length})
                  </Button>
                </div>
              }
            >
              {matchedItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500 border border-dashed border-slate-850 rounded-2xl bg-slate-950/5">
                  <ListChecks className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-400">Match Preview Empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto text-center font-normal">
                    Configure your spreadsheet columns and select matching images on the left. The app will pair them here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                  {matchedItems.map((item, idx) => {
                    const localImageSrc = item.imagePath ? `media:///${item.imagePath.replace(/\\/g, '/')}` : '';
                    return (
                      <div
                        key={idx}
                        className="flex gap-4 p-3 bg-slate-900/30 border border-slate-850 rounded-xl hover:bg-slate-900/60 transition-colors items-start"
                      >
                        {/* Image Preview Thumbnail */}
                        <div className="w-16 h-20 rounded-lg bg-slate-950 border border-slate-700/50 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {localImageSrc ? (
                            <img src={localImageSrc} alt="" className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-700" />
                          )}
                        </div>

                        {/* Text fields */}
                        <div className="min-w-0 flex-grow text-xs text-slate-350">
                          <div className="flex justify-between items-start gap-3">
                            <h4 className="font-bold text-slate-200 truncate leading-normal" title={item.title}>
                              {item.title || <span className="italic text-slate-550">Untitled Row</span>}
                            </h4>
                            {item.status === 'ready' && (
                              <span className="bg-emerald-955/20 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-0.5 flex-shrink-0">
                                <Check className="w-2.5 h-2.5" /> Ready
                              </span>
                            )}
                            {item.status === 'missing_image' && (
                              <span className="bg-amber-955/25 text-amber-400 border border-amber-900/40 px-2 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0">
                                ⚠️ Image Missing
                              </span>
                            )}
                            {item.status === 'missing_title' && (
                              <span className="bg-rose-955/25 text-rose-400 border border-rose-900/40 px-2 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0">
                                ❌ Title Missing
                              </span>
                            )}
                          </div>
                          
                          <p className="text-[11px] text-slate-450 line-clamp-2 mt-1 leading-normal" title={item.description}>
                            {item.description || <span className="italic text-slate-600">No description text.</span>}
                          </p>
                          
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500 font-mono">
                            <span className="truncate max-w-[200px]" title={item.filename}>
                              File: {item.filename.split(/[\\/]/).pop()}
                            </span>
                            {item.destinationUrl && (
                              <span className="truncate max-w-[200px] text-blue-450 hover:underline" title={item.destinationUrl}>
                                Link: {item.destinationUrl}
                              </span>
                            )}
                            {item.scheduledDate && item.scheduledTime && (
                              <span className="text-purple-400 font-bold truncate max-w-[250px]">
                                📅 Schedule: {item.scheduledDate} at {item.scheduledTime}
                              </span>
                            )}
                            {item.batchBoardName && (
                              <span className="text-violet-400 font-bold truncate max-w-[200px]">
                                📌 Board: {item.batchBoardName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Modal
        isOpen={isPublishConfirmOpen}
        title="Confirm Pin Publication"
        onClose={() => setIsPublishConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsPublishConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={executeDirectPublish}>
              Yes, Publish Now
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-sm text-slate-300 leading-relaxed">
          <p>
            You are about to start an immediate publishing queue targeting <strong className="text-white">{selectedAccountIds.length} account(s)</strong>.
          </p>
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850 flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Submission summary</span>
            <div className="flex justify-between">
              <span>Pin Title:</span>
              <span className="font-bold text-white truncate max-w-[200px]">{title || '(Untitled)'}</span>
            </div>
            <div className="flex justify-between">
              <span>Image path:</span>
              <span className="font-mono text-slate-400 truncate max-w-[200px]">{imagePath}</span>
            </div>
            <div className="flex justify-between">
              <span>Target Accounts:</span>
              <span className="font-bold text-white">
                {selectedAccountIds.map(id => accounts.find(a => a.id === id)?.nickname).join(', ')}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 italic">
            This starts visible automated browser sessions sequentially to type and submit details. Please do not close the browser windows that open.
          </p>
        </div>
      </Modal>
    </div>
  );
};
