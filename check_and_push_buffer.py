import os
import sys
import sqlite3
import subprocess
import argparse
from datetime import datetime, timedelta

def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Pinterest Cloud Rolling Buffer Check & Advance Push")
    parser.add_argument("--force", action="store_true", help="Force scheduling the next batch regardless of buffer threshold")
    parser.add_argument("--min-buffer-days", type=int, default=7, help="Minimum buffer in days before triggering advance schedule (default: 7)")
    parser.add_argument("--advance-days", type=int, default=10, help="Number of days to advance schedule when triggered (default: 10)")
    args = parser.parse_args()

    app_db = os.path.expandvars(r'%APPDATA%\pinterest-pin-publisher\local-data\app.db')
    if not os.path.exists(app_db):
        print(f"❌ Error: app.db not found at {app_db}")
        sys.exit(1)

    target_accounts = [
        'acc_homestylemuse',
        'acc_stylefueldaily',
        'acc_savvywealthdaily',
        'acc_coifchronicle'
    ]

    conn = sqlite3.connect(app_db)
    cur = conn.cursor()

    today_str = datetime.now().strftime('%Y-%m-%d')
    today_dt = datetime.strptime(today_str, '%Y-%m-%d')

    print("==============================================================")
    print("🚀 PINTEREST CLOUD ROLLING BUFFER MONITOR")
    print(f"Current Date: {today_str}")
    print(f"Minimum Safe Buffer Threshold: {args.min_buffer_days} days")
    print("==============================================================\n")

    account_stats = {}
    min_buffer_days_found = 9999
    min_latest_date = None

    for acc in target_accounts:
        cur.execute("""
            SELECT MAX(scheduledDate), COUNT(*) 
            FROM queue_jobs 
            WHERE accountId = ? AND status = 'cloud_scheduled'
        """, (acc,))
        row = cur.fetchone()
        latest_date_str = row[0]
        total_cloud = row[1] or 0

        cur.execute("""
            SELECT COUNT(*) 
            FROM queue_jobs 
            WHERE accountId = ? AND status = 'scheduled'
        """, (acc,))
        pending_scheduled = cur.fetchone()[0] or 0

        if latest_date_str:
            latest_dt = datetime.strptime(latest_date_str, '%Y-%m-%d')
            diff_days = (latest_dt - today_dt).days
        else:
            diff_days = 0

        account_stats[acc] = {
            'latest_cloud_date': latest_date_str or 'None',
            'days_ahead': diff_days,
            'cloud_count': total_cloud,
            'pending_count': pending_scheduled
        }

        if diff_days < min_buffer_days_found:
            min_buffer_days_found = diff_days
            min_latest_date = latest_date_str

        print(f"[{acc}]")
        print(f"  - Cloud Locked: {total_cloud} pins (Latest: {latest_date_str or 'None'})")
        print(f"  - Days Ahead of Today: {diff_days} days")
        print(f"  - Pending in Queue: {pending_scheduled} pins")

    conn.close()

    print("\n--------------------------------------------------------------")
    print(f"Network Summary: Lowest buffer across accounts is {min_buffer_days_found} days.")
    print("--------------------------------------------------------------\n")

    should_run = args.force or (min_buffer_days_found < args.min_buffer_days)

    if not should_run:
        print("🛡️ STATUS: HEALTHY BUFFER.")
        print(f"You have {min_buffer_days_found} days of pins safely locked on Pinterest's servers.")
        print("Pinterest will publish automatically. No push required today.")
        print("==============================================================")
        sys.exit(0)

    print("⚠️ TRIGGER ACTIVATED: Buffer is below threshold or --force was specified!")
    
    # Calculate target until date
    base_date = min_latest_date if min_latest_date else today_str
    base_dt = datetime.strptime(base_date, '%Y-%m-%d')
    target_dt = base_dt + timedelta(days=args.advance_days)
    target_date_str = target_dt.strftime('%Y-%m-%d')

    # Hard cap at Month 2 end: 2026-12-09
    if target_date_str > '2026-12-09':
        target_date_str = '2026-12-09'

    print(f"Advancing Pinterest Cloud schedule through: {target_date_str}")
    print("Launching bulk_cloud_scheduler.js ...\n")

    poster_dir = os.path.dirname(os.path.abspath(__file__))
    cmd = ["node", "bulk_cloud_scheduler.js", f"--until={target_date_str}"]

    proc = subprocess.Popen(
        cmd,
        cwd=poster_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )

    for line in iter(proc.stdout.readline, ''):
        sys.stdout.write(line)
        sys.stdout.flush()

    proc.wait()
    print(f"\nScheduler finished with return code: {proc.returncode}")
    sys.exit(proc.returncode)

if __name__ == '__main__':
    main()
