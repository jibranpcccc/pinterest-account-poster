class BrowserLockManager {
  private activeAccountId: string | null = null;
  private activeTaskName: string | null = null;
  private lockTimestamp: number | null = null;

  /**
   * Attempts to acquire the global browser lock for a specific account and task.
   * Throws an error if the lock is already held by any task.
   * 
   * @param accountId The ID of the account requesting the browser.
   * @param taskName A human-readable name of the task (e.g., 'Publishing Queue', 'Auto-Repin').
   */
  public acquireLock(accountId: string, taskName: string): void {
    if (this.activeAccountId !== null) {
      const minutesLocked = Math.floor((Date.now() - (this.lockTimestamp || 0)) / 60000);
      throw new Error(`BROWSER_LOCKED: The browser is currently busy with [${this.activeTaskName}] for another account. Please wait or stop the current task before starting a new one. (Locked for ${minutesLocked}m)`);
    }

    this.activeAccountId = accountId;
    this.activeTaskName = taskName;
    this.lockTimestamp = Date.now();
    console.log(`🔒 [BrowserLockManager] Lock ACQUIRED for account [${accountId}] by task [${taskName}]`);
  }

  /**
   * Releases the global browser lock.
   */
  public releaseLock(): void {
    console.log(`🔓 [BrowserLockManager] Lock RELEASED from account [${this.activeAccountId}] by task [${this.activeTaskName}]`);
    this.activeAccountId = null;
    this.activeTaskName = null;
    this.lockTimestamp = null;
  }

  /**
   * Checks if the browser is currently locked.
   */
  public isLocked(): boolean {
    return this.activeAccountId !== null;
  }

  /**
   * Gets the ID of the account currently holding the lock.
   */
  public getActiveAccountId(): string | null {
    return this.activeAccountId;
  }

  /**
   * Gets the name of the task currently holding the lock.
   */
  public getActiveTaskName(): string | null {
    return this.activeTaskName;
  }
}

// Export as a singleton
export const browserLockManager = new BrowserLockManager();
