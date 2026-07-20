import { DbManager } from '../database/db';
import { PinterestSessionAdapter } from './pinterestSessionAdapter';
import { BoardResolver } from './boardResolver';
import { PublishExecutor, PublishResult } from './publishExecutor';
import { QueueJob, Account } from '../types';
import { Notification } from 'electron';

export class PublisherAdapter {
  private db: DbManager;
  private sessionAdapter: PinterestSessionAdapter;
  private boardResolver: BoardResolver;
  private executor: PublishExecutor;
  
  // Execution Control state
  private activeJobsList: string[] = [];
  private currentExecutingIndex = 0;
  private executionActive = false;

  private onStatusChangeCallbacks: (() => void)[] = [];

  public registerOnStatusChange(cb: () => void) {
    this.onStatusChangeCallbacks.push(cb);
  }

  private notifyStatusChange() {
    for (const cb of this.onStatusChangeCallbacks) {
      try {
        cb();
      } catch (e) {
        console.error('Error in status change callback:', e);
      }
    }
  }

  constructor(db: DbManager) {
    this.db = db;
    this.sessionAdapter = new PinterestSessionAdapter(db);
    this.boardResolver = new BoardResolver(db);
    this.executor = new PublishExecutor(db);
  }

  public getSessionAdapter() {
    return this.sessionAdapter;
  }

  public getBoardResolver() {
    return this.boardResolver;
  }

  public getExecutor() {
    return this.executor;
  }

  public isQueueActive(): boolean {
    return this.executionActive;
  }

  public pauseQueue() {
    this.executor.pause();
  }

  public resumeQueue() {
    this.executor.resume();
  }

  public async stopQueue() {
    this.executor.stop();
    this.executionActive = false;

    // Mark current active job as failed/stopped if it was running
    if (this.activeJobsList.length > 0 && this.currentExecutingIndex < this.activeJobsList.length) {
      const jobId = this.activeJobsList[this.currentExecutingIndex];
      const jobs = await this.db.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [jobId]);
      if (jobs.length > 0 && (jobs[0].status === 'running' || jobs[0].status === 'pending')) {
        await this.db.saveQueueJob({
          ...jobs[0],
          status: 'failed',
          errorMessage: 'Queue stopped by user.'
        });
        this.notifyStatusChange();
      }
    }
  }

  /**
   * Starts sequential queue processing.
   */
  public async processQueue(
    jobIds: string[],
    onProgress: (data: any) => void
  ): Promise<void> {
    if (this.executionActive) {
      console.warn('Queue execution is already running.');
      return;
    }

    this.activeJobsList = jobIds;
    this.currentExecutingIndex = 0;
    this.executionActive = true;

    const settings = await this.db.getSettings();
    const isMockMode = settings.mockMode === true;
    
    let completedCount = 0;
    let failedCount = 0;
    const totalCount = jobIds.length;

    await this.db.addLog('info', `Starting publish queue with ${totalCount} pins. Mode: ${isMockMode ? 'MOCK / DEMO' : 'PRODUCTION'}`);

    for (let i = 0; i < totalCount; i++) {
      if (!this.executionActive) break;
      
      this.currentExecutingIndex = i;
      const jobId = jobIds[i];
      
      // Load job details
      const jobs = await this.db.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [jobId]);
      if (jobs.length === 0) continue;
      const job = jobs[0];

      // Update job status to running
      await this.db.saveQueueJob({
        ...job,
        status: 'running',
        startedAt: new Date().toISOString()
      });
      this.notifyStatusChange();

      // Load account details
      const accounts = await this.db.query<Account>('SELECT * FROM accounts WHERE id = ?', [job.accountId]);
      if (accounts.length === 0) {
        await this.db.saveQueueJob({
          ...job,
          status: 'failed',
          errorMessage: 'Account not found locally.'
        });
        this.notifyStatusChange();
        failedCount++;
        onProgress({
          jobId, status: 'failed', progress: 100, message: 'Account not found',
          completedCount, failedCount, totalCount
        });
        continue;
      }
      const account = accounts[0];

      try {
        // Close manual login browser if it's currently open to release profile lock
        if (!isMockMode) {
          await this.sessionAdapter.closeLoginSession(account.id);
        }
        let result: PublishResult;

        if (isMockMode) {
          // Reset executor state before mock job (same as executeJob does for real jobs)
          this.executor['isStopped'] = false;
          this.executor['isPaused'] = false;
          result = await this.executeMockJob(job, account, (msg, prog) => {
            onProgress({
              jobId, status: 'running', progress: prog, message: msg,
              completedCount, failedCount, totalCount
            });
          });
        } else {
          result = await this.executor.executeJob(job, account, settings, (progData) => {
            onProgress({
              jobId,
              status: progData.status,
              progress: progData.progress,
              message: progData.message,
              completedCount,
              failedCount,
              totalCount
            });
          });
        }

        // Save result
        const status = result.status;
        await this.db.saveQueueJob({
          ...job,
          status,
          errorMessage: result.message === 'Published successfully.' ? null : result.message,
          screenshotPath: result.screenshotPath,
          livePinUrl: result.livePinUrl || null,
          completedAt: result.completedAt
        });
        this.notifyStatusChange();

        // Show native notification if enabled
        if (settings.showNotificationOnPost === true && Notification.isSupported()) {
          try {
            const notif = new Notification({
              title: 'Pinterest Pin Publisher',
              body: status === 'completed'
                ? `✅ Pin posted to ${job.boardName || 'Pinterest'}`
                : `❌ Failed: ${result.message || 'Unknown error'}`
            });
            notif.show();
          } catch (notifErr) {
            console.error('Failed to trigger native OS notification:', notifErr);
          }
        }

        if (status === 'completed') {
          completedCount++;
        } else {
          failedCount++;
          if (settings.continueAfterFailure === false && result.message !== 'STOPPED') {
            await this.db.addLog('warn', 'Queue stopped due to failure (configured to halt on errors).');
            this.executionActive = false;
          }
        }

        // Notify final job state
        onProgress({
          jobId,
          status,
          progress: 100,
          message: status === 'completed' ? 'Pin Published' : `Failed: ${result.message}`,
          completedCount,
          failedCount,
          totalCount
        });

        // 8. Pacing between pins
        if (i < totalCount - 1 && this.executionActive) {
          // Determine next job account to apply account-delay vs pin-delay
          const nextJobId = jobIds[i + 1];
          const nextJobs = await this.db.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [nextJobId]);
          const nextJob = nextJobs[0];
          
          let delaySeconds = 0;
          let delayType = 'pin';

          if (nextJob && nextJob.accountId !== job.accountId) {
            // Account changed!
            const [accMin, accMax] = settings.accountDelay || [30, 60];
            delaySeconds = Math.floor(Math.random() * (accMax - accMin) + accMin);
            delayType = 'account change';
          } else {
            // Same account pin delay
            const [pinMin, pinMax] = settings.pinDelay || [30, 45];
            delaySeconds = Math.floor(Math.random() * (pinMax - pinMin) + pinMin);
          }

          console.log(`⏳ Pacing: Sleeping for ${delaySeconds}s (${delayType} delay) before next Pin...`);
          
          for (let elapsed = 0; elapsed < delaySeconds; elapsed++) {
            if (!this.executionActive) break;
            
            // Check if active executor is paused (user clicks pause while pacing)
            if (this.executor['isPaused']) {
              onProgress({
                jobId: nextJobId || '', status: 'paused', progress: 0,
                message: 'Queue paused during pacing delay. Waiting for resume...',
                completedCount, failedCount, totalCount
              });
              while (this.executor['isPaused'] && this.executionActive) {
                await new Promise(r => setTimeout(r, 1000));
              }
            }

            onProgress({
              jobId: nextJobId || '',
              status: 'pending',
              progress: 0,
              message: `Pacing: Waiting ${delaySeconds - elapsed}s before starting next job...`,
              completedCount,
              failedCount,
              totalCount
            });
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } catch (err: any) {
        console.error('Job error in sequential processing:', err);
        failedCount++;
        await this.db.saveQueueJob({
          ...job,
          status: 'failed',
          errorMessage: err.message
        });
        this.notifyStatusChange();

        onProgress({
          jobId, status: 'failed', progress: 100, message: err.message,
          completedCount, failedCount, totalCount
        });

        if (settings.continueAfterFailure === false) {
          this.executionActive = false;
        }
      }
    }

    const stoppedEarly = this.currentExecutingIndex < totalCount - 1 || !this.executionActive;
    if (stoppedEarly) {
      for (const jobId of jobIds) {
        const jobs = await this.db.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [jobId]);
        if (jobs.length > 0) {
          const job = jobs[0];
          if (job.status === 'running') {
            const hasSchedule = !!(job.scheduledDate && job.scheduledTime);
            await this.db.saveQueueJob({
              ...job,
              status: hasSchedule ? 'scheduled' : 'pending',
              errorMessage: 'Queue execution was stopped/interrupted before this job could be processed.'
            });
            this.notifyStatusChange();
            await this.db.addLog('info', `Reset unprocessed job ${job.id} from running back to ${hasSchedule ? 'scheduled' : 'pending'}.`);
          }
        }
      }
    }

    this.executionActive = false;
    await this.db.addLog('info', `Publish queue execution completed. Success: ${completedCount}, Failed: ${failedCount}`);
  }

  /**
   * Execution simulation for Mock Mode
   */
  private async executeMockJob(
    job: QueueJob,
    account: Account,
    onProgress: (msg: string, progress: number) => void
  ): Promise<PublishResult> {
    const startedAt = new Date().toISOString();
    
    const steps = [
      { msg: 'Mock: Initializing browser connection...', progress: 10 },
      { msg: 'Mock: Navigating to Pinterest Pin Builder...', progress: 25 },
      { msg: 'Mock: Uploading local image...', progress: 40 },
      { msg: 'Mock: Filling title, description, and link...', progress: 60 },
      { msg: `Mock: Selecting board '${job.boardName}'...`, progress: 80 },
      { msg: 'Mock: Submitting Pin to Pinterest...', progress: 95 },
    ];

    for (const step of steps) {
      if (this.executor['isStopped']) {
        throw new Error('STOPPED');
      }
      
      // Handle mock pauses
      if (this.executor['isPaused']) {
        onProgress('Mock: Execution paused by user.', step.progress);
        while (this.executor['isPaused'] && !this.executor['isStopped']) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (this.executor['isStopped']) {
          throw new Error('STOPPED');
        }
        onProgress('Mock: Resuming...', step.progress);
      }

      onProgress(step.msg, step.progress);
      await new Promise(r => setTimeout(r, 1000)); // 1s per step in mock mode
    }

    // Determine mock failure or success (90% success, 10% failure if URL contains 'fail' for testing)
    const isFailure = job.destinationUrl.toLowerCase().includes('fail') || job.title.toLowerCase().includes('fail');
    const completedAt = new Date().toISOString();

    if (isFailure) {
      return {
        jobId: job.id,
        accountId: account.id,
        boardName: job.boardName,
        status: 'failed',
        message: 'Mock Failure: Connection timed out (simulated).',
        screenshotPath: undefined,
        startedAt,
        completedAt
      };
    }

    return {
      jobId: job.id,
      accountId: account.id,
      boardName: job.boardName,
      status: 'completed',
      message: 'Published successfully.',
      startedAt,
      completedAt
    };
  }

  /**
   * Automatically verifies and logs in all accounts that have email/password configured on startup.
   */
  public async performStartupAutoLogin(): Promise<void> {
    const accounts = await this.db.getAccounts();
    console.log(`🧹 AutoLogin: Checking startup sessions for ${accounts.length} accounts...`);
    
    for (const account of accounts) {
      console.log(`🧹 AutoLogin: Checking session for '${account.nickname}'...`);
      
      // ALWAYS verify the session regardless of whether credentials are saved.
      // This ensures manual-login accounts also show correct Connected/Disconnected state.
      const isConnected = await this.sessionAdapter.verifySession(account);
      
      if (isConnected) {
        console.log(`🧹 AutoLogin: Session already valid for '${account.nickname}'`);
        await this.db.saveAccount({
          ...account,
          sessionStatus: 'connected',
          lastUsedAt: new Date().toISOString()
        });
      } else if (account.email && account.password) {
        // Session expired but credentials saved — attempt auto re-login
        console.log(`🧹 AutoLogin: Session invalid for '${account.nickname}'. Has credentials — attempting auto-login...`);
        const loginSuccess = await this.sessionAdapter.autoLoginAccount(account);
        if (loginSuccess) {
          console.log(`🧹 AutoLogin: Session successfully restored for '${account.nickname}'`);
        } else {
          console.warn(`🧹 AutoLogin: Auto-login failed for '${account.nickname}' — user must log in manually`);
          await this.db.saveAccount({ ...account, sessionStatus: 'disconnected' });
        }
      } else {
        // Session expired, no credentials saved — mark disconnected, needs manual login
        console.warn(`🧹 AutoLogin: '${account.nickname}' session expired. No credentials saved — marking disconnected.`);
        await this.db.saveAccount({ ...account, sessionStatus: 'disconnected' });
      }
    }
    console.log(`🧹 AutoLogin: Startup session check complete for all ${accounts.length} accounts.`);
  }
}
