import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { 
  Settings as SettingsIcon, Sliders, ShieldCheck, 
  Cpu, Sparkles, FolderOpen, AlertOctagon, HelpCircle,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';

interface SettingsProps {
  onRefreshSettings: () => Promise<void>;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
  isMockMode: boolean;
  setIsMockMode: (val: boolean) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  onRefreshSettings,
  onShowToast,
  isMockMode,
  setIsMockMode
}) => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);

  // Settings local states
  const [actionDelayMin, setActionDelayMin] = useState(1.5);
  const [actionDelayMax, setActionDelayMax] = useState(4.0);
  const [pinDelayMin, setPinDelayMin] = useState(2);
  const [pinDelayMax, setPinDelayMax] = useState(5);
  const [accountDelayMin, setAccountDelayMin] = useState(5);
  const [accountDelayMax, setAccountDelayMax] = useState(180);
  const [maxRetries, setMaxRetries] = useState(2);
  const [screenshotOnError, setScreenshotOnError] = useState(true);
  const [continueAfterFailure, setContinueAfterFailure] = useState(false);
  const [headlessQueue, setHeadlessQueue] = useState(false);

  // AI states
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.opencode.dev/v1');
  const [aiModel, setAiModel] = useState('opencode-big-pickle');
  const [aiTimeout, setAiTimeout] = useState(30);

  // Watermark Settings
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setIsMockMode(data.mockMode === true);

      // Pacing delays
      if (data.actionDelay) {
        setActionDelayMin(data.actionDelay[0]);
        setActionDelayMax(data.actionDelay[1]);
      }
      if (data.pinDelay) {
        setPinDelayMin(data.pinDelay[0]);
        setPinDelayMax(data.pinDelay[1]);
      }
      if (data.accountDelay) {
        setAccountDelayMin(data.accountDelay[0]);
        setAccountDelayMax(data.accountDelay[1]);
      }
      
      setMaxRetries(data.maxRetries ?? 2);
      setScreenshotOnError(data.screenshotOnError !== false);
      setContinueAfterFailure(data.continueAfterFailure === true);
      setHeadlessQueue(data.headlessQueue !== false);

      // AI Settings
      setAiEnabled(data.aiEnabled === true);
      setAiApiKey(data.aiApiKey || '');
      setAiBaseUrl(data.aiBaseUrl || 'https://api.opencode.dev/v1');
      setAiModel(data.aiModel || 'opencode-big-pickle');
      setAiTimeout(data.aiTimeout || 30);

      // Watermark Settings
      setWatermarkEnabled(data.watermarkEnabled === true);
      setWatermarkText(data.watermarkText || '');
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Validate delays
      if (actionDelayMin > actionDelayMax || pinDelayMin > pinDelayMax || accountDelayMin > accountDelayMax) {
        throw new Error('Minimum delay values cannot be larger than maximum values.');
      }

      await api.saveSetting('mockMode', isMockMode);
      await api.saveSetting('actionDelay', [Number(actionDelayMin), Number(actionDelayMax)]);
      await api.saveSetting('pinDelay', [Number(pinDelayMin), Number(pinDelayMax)]);
      await api.saveSetting('accountDelay', [Number(accountDelayMin), Number(accountDelayMax)]);
      await api.saveSetting('maxRetries', Number(maxRetries));
      await api.saveSetting('screenshotOnError', screenshotOnError);
      await api.saveSetting('continueAfterFailure', continueAfterFailure);
      await api.saveSetting('headlessQueue', headlessQueue);
      
      // AI Settings
      await api.saveSetting('aiEnabled', aiEnabled);
      await api.saveSetting('aiApiKey', aiApiKey);
      await api.saveSetting('aiBaseUrl', aiBaseUrl);
      await api.saveSetting('aiModel', aiModel);
      await api.saveSetting('aiTimeout', Number(aiTimeout));

      // Watermark Settings
      await api.saveSetting('watermarkEnabled', watermarkEnabled);
      await api.saveSetting('watermarkText', watermarkText);

      onShowToast('Settings saved successfully.', 'success');
      await onRefreshSettings();
      await loadSettings();
    } catch (e: any) {
      onShowToast(`Failed to save settings: ${e.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAIConnection = async () => {
    if (!aiApiKey) {
      onShowToast('Please provide an OpenCode API key first.', 'warn');
      return;
    }

    setIsTestingAI(true);
    onShowToast('Testing OpenCode API connection...', 'info');
    try {
      // Temporarily save to ensure connection gets correct parameters
      await api.saveSetting('aiEnabled', true);
      await api.saveSetting('aiApiKey', aiApiKey);
      await api.saveSetting('aiBaseUrl', aiBaseUrl);
      await api.saveSetting('aiModel', aiModel);
      await api.saveSetting('aiTimeout', aiTimeout);

      // Trigger test via metadata check with mock parameters
      const payload = {
        title: 'Test Title Connection',
        description: 'Test Description details for testing the connection'
      };
      
      const res = await api.callAI('validatePinMetadata', payload);
      if (res && res.warnings !== undefined) {
        onShowToast('API Connection Successful! OpenCode is online.', 'success');
      } else {
        throw new Error('Received unexpected empty payload from API.');
      }
    } catch (e: any) {
      onShowToast(`Connection Test Failed: ${e.message}`, 'error');
    } finally {
      setIsTestingAI(false);
      // Reload settings in case they changed
      await loadSettings();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading configurations...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">SETTINGS</h1>
          <p className="text-sm text-slate-400">Configure delays, pacing, AI assistance, and security flags.</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveSettings}
          loading={isSaving}
        >
          Save Settings
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* General and Mock Mode */}
          <Card title="App Modes & Pacing" subtitle="Safety delay intervals" className="border-slate-800">
            <div className="flex flex-col gap-5 text-sm">
              {/* Mock Mode Toggle */}
              <div className="flex items-start justify-between bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                <div className="flex flex-col gap-1 pr-4">
                  <span className="font-bold text-slate-200">Sandbox Mock Mode</span>
                  <span className="text-xs text-slate-500 leading-normal">
                    When enabled, the queue, manual connections, and board refresh tasks will simulate actions inside the app without actually launching Playwright or logging into Pinterest. Perfect for trying out UI/CSV features safely.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isMockMode}
                  onChange={(e) => setIsMockMode(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-5 h-5 cursor-pointer mt-1"
                />
              </div>

              {/* Action Pacing */}
              <div className="flex flex-col gap-4">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-550 flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <Sliders className="w-3.5 h-3.5" /> Pacing Delays (Seconds)
                </span>
                
                {/* Action delay */}
                <div className="grid grid-cols-3 items-center gap-4">
                  <span className="text-xs font-semibold text-slate-350">Action Delay (Min/Max):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={actionDelayMin}
                    onChange={(e) => setActionDelayMin(parseFloat(e.target.value))}
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={actionDelayMax}
                    onChange={(e) => setActionDelayMax(parseFloat(e.target.value))}
                  />
                </div>
                <p className="text-[11px] text-slate-550 -mt-2 leading-normal">
                  Delay applied between sequential UI interactions (e.g. typing fields, selecting files) to guarantee stability.
                </p>

                {/* Pin delay */}
                <div className="grid grid-cols-3 items-center gap-4">
                  <span className="text-xs font-semibold text-slate-350">Pin-to-Pin Delay (Min/Max):</span>
                  <input
                    type="number"
                    min="0"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={pinDelayMin}
                    onChange={(e) => setPinDelayMin(parseInt(e.target.value))}
                  />
                  <input
                    type="number"
                    min="0"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={pinDelayMax}
                    onChange={(e) => setPinDelayMax(parseInt(e.target.value))}
                  />
                </div>
                <p className="text-[11px] text-slate-550 -mt-2 leading-normal">
                  Pacing rest period between uploading separate Pins on the same account.
                </p>

                {/* Account delay */}
                <div className="grid grid-cols-3 items-center gap-4">
                  <span className="text-xs font-semibold text-slate-350">Account Switch Delay (Min/Max):</span>
                  <input
                    type="number"
                    min="10"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={accountDelayMin}
                    onChange={(e) => setAccountDelayMin(parseInt(e.target.value))}
                  />
                  <input
                    type="number"
                    min="10"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center"
                    value={accountDelayMax}
                    onChange={(e) => setAccountDelayMax(parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Publisher Logic Settings */}
          <Card title="Retries & Error Handling" subtitle="Configure publisher safeguards">
            <div className="flex flex-col gap-4 text-sm">
              {/* Max retries */}
              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-slate-200">Max Job Retries</span>
                  <span className="text-[11px] text-slate-500">Number of retries for transient networking failures.</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="5"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 text-center w-20"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                />
              </div>

              {/* Screenshot on error */}
              <div className="flex items-center justify-between border-b border-slate-850 pb-3 font-medium">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Screenshot on Failure</span>
                  <span className="text-[11px] text-slate-500">Saves a visual PNG of the browser page when automation crashes.</span>
                </div>
                <input
                  type="checkbox"
                  checked={screenshotOnError}
                  onChange={(e) => setScreenshotOnError(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Continue after failure */}
              <div className="flex items-center justify-between border-b border-slate-855 pb-3 font-medium">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Continue Queue on Failure</span>
                  <span className="text-[11px] text-slate-500">If checked, subsequent queue jobs run even if a previous job fails.</span>
                </div>
                <input
                  type="checkbox"
                  checked={continueAfterFailure}
                  onChange={(e) => setContinueAfterFailure(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-955 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Headless Queue Mode */}
              <div className="flex items-center justify-between font-medium">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Headless Queue Mode (100% Background)</span>
                  <span className="text-[11px] text-slate-500">If enabled, automated publisher runs silently without showing browser window.</span>
                </div>
                <input
                  type="checkbox"
                  checked={headlessQueue}
                  onChange={(e) => setHeadlessQueue(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Image Protection Settings */}
          <Card title="Image Protection" subtitle="Automatically watermark uploaded pins" className="border-slate-800">
            <div className="flex flex-col gap-4 text-xs">
              {/* Enable Watermark Checkbox */}
              <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                <span className="font-bold text-slate-200">Enable Auto-Watermarking</span>
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Watermark Text */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Watermark Text</label>
                <input
                  type="text"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-slate-650"
                  placeholder="e.g. MyBrand.com"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  disabled={!watermarkEnabled}
                />
              </div>
            </div>
          </Card>

          {/* AI Settings */}
          <Card title="AI Copilot Integration" subtitle="Optional OpenCode metadata assist" className="border-slate-800">
            <div className="flex flex-col gap-4 text-xs">
              {/* Enable AI Checkbox */}
              <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                <span className="font-bold text-slate-200">Enable AI Assistance</span>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-black text-slate-500 tracking-wider">OpenCode API Key</label>
                <input
                  type="password"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-slate-650"
                  placeholder="OPENCODE_API_KEY=..."
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  disabled={!aiEnabled}
                />
              </div>

              {/* Base URL */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Base URL</label>
                <input
                  type="text"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-slate-650"
                  placeholder="https://api.opencode.dev/v1"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  disabled={!aiEnabled}
                />
              </div>

              {/* Model */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Model Name</label>
                <input
                  type="text"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-slate-650"
                  placeholder="opencode-big-pickle"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  disabled={!aiEnabled}
                />
              </div>

              {/* Actions */}
              {aiEnabled && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                  onClick={handleTestAIConnection}
                  loading={isTestingAI}
                  className="mt-2 py-2"
                >
                  Test Connection
                </Button>
              )}
            </div>
          </Card>

          {/* Data & Backups */}
          <Card title="Data & Backups" subtitle="Manage your footprints and data" className="border-slate-800">
            <div className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-3">
                <Button 
                  variant="secondary" 
                  icon={<FolderOpen className="w-4 h-4" />}
                  onClick={async () => {
                    try {
                      const success = await api.exportBackup();
                      if (success) onShowToast('Export completed successfully!', 'success');
                    } catch (e: any) {
                      onShowToast(`Export failed: ${e.message}`, 'error');
                    }
                  }}
                  className="w-full justify-center"
                >
                  Export Footprints & Data
                </Button>
                <p className="text-[11px] text-slate-500 leading-normal text-center">
                  Save all accounts, databases, and browser profiles into a ZIP file.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-850 pt-4">
                <Button 
                  variant="primary" 
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={async () => {
                    if (window.confirm('Importing will overwrite your current data and restart the app. Continue?')) {
                      try {
                        await api.importBackup();
                      } catch (e: any) {
                        onShowToast(`Import failed: ${e.message}`, 'error');
                      }
                    }
                  }}
                  className="w-full justify-center bg-pinterest-red text-white"
                >
                  Import Footprints & Data
                </Button>
                <p className="text-[11px] text-slate-500 leading-normal text-center">
                  Restore data from a ZIP backup. The app will restart automatically.
                </p>
              </div>
            </div>
          </Card>

          {/* Compliance and Terms */}
          <Card title="Compliance & Safety Notice" subtitle="Please read carefully">
            <div className="flex flex-col gap-3 text-xs text-slate-400 leading-normal">
              <div className="flex gap-2 text-rose-400 bg-rose-950/15 p-2 rounded-lg border border-rose-900/30">
                <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="font-bold">Disclaimer:</span>
              </div>
              <p>
                This application is a local publishing assistant that uses visible browser window automation. It does not use stealth or bypass checks, does not hide its user-agent, and does not automate follows, repins, likes, or comments.
              </p>
              <p className="font-bold text-slate-200">
                "Users are responsible for following Pinterest rules and should only publish content they own or have permission to use."
              </p>
              <p>
                Using rapid pacing or posting spam links may lead to Pinterest flagging your account. Maintain safe delays (e.g. 5+ minutes between pins) when running production jobs.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
