/**
 * Centralized Date & Time Utilities
 * Handles 12h <-> 24h conversions, ISO date formatting, countdown calculations,
 * and zero-padded time strings for HTML5 <input type="time"> compatibility.
 */

/**
 * Converts a 12-hour time string (e.g., "9:30 AM", "09:30 PM", "9:30") to a strict 24-hour format "HH:mm".
 * Always guarantees 2-digit zero-padded hours ("09:30", not "9:30") for HTML5 input compatibility.
 */
export function convert12hTo24h(time12?: string): string {
  if (!time12 || typeof time12 !== 'string') return '';
  const clean = time12.trim().toUpperCase();
  if (!clean) return '';

  const isAm = clean.endsWith('AM');
  const isPm = clean.endsWith('PM');

  if (!isAm && !isPm) {
    // Already in 24h format or partial format: ensure HH:mm 2-digit padding
    const parts = clean.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    return clean;
  }

  const timePart = clean.replace(/(AM|PM)/g, '').trim();
  const parts = timePart.split(':');
  if (parts.length < 2) return '';

  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minute)) return '';

  if (isPm && hour !== 12) hour += 12;
  if (isAm && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Converts a 24-hour time string "HH:mm" to 12-hour format "h:mm AM/PM".
 */
export function convert24hTo12h(time24?: string): string {
  if (!time24 || typeof time24 !== 'string') return '';
  const clean = time24.trim();
  if (!clean) return '';

  const parts = clean.split(':');
  if (parts.length < 2) return clean;

  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minute)) return clean;

  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Parses date string (YYYY-MM-DD or MM/DD/YYYY) and time string into Epoch milliseconds.
 */
export function parseDateTimeToMs(dateStr?: string, timeStr?: string): number {
  if (!dateStr) return 0;

  let year = 0;
  let month = 0;
  let day = 0;

  const dateParts = dateStr.trim().split(/[-/]/);
  if (dateParts.length === 3) {
    if (dateParts[0].length === 4) {
      // YYYY-MM-DD
      year = parseInt(dateParts[0], 10);
      month = parseInt(dateParts[1], 10);
      day = parseInt(dateParts[2], 10);
    } else {
      // MM-DD-YYYY or DD-MM-YYYY
      const first = parseInt(dateParts[0], 10);
      const second = parseInt(dateParts[1], 10);
      year = parseInt(dateParts[2], 10);
      if (first > 12) {
        day = first;
        month = second;
      } else {
        month = first;
        day = second;
      }
    }
  }

  if (!year || !month || !day) {
    const fallback = new Date(dateStr);
    if (!isNaN(fallback.getTime())) return fallback.getTime();
    return 0;
  }

  let hour = 0;
  let minute = 0;

  if (timeStr) {
    const time24 = convert12hTo24h(timeStr);
    const timeParts = time24.split(':');
    if (timeParts.length >= 2) {
      hour = parseInt(timeParts[0], 10) || 0;
      minute = parseInt(timeParts[1], 10) || 0;
    }
  }

  const targetDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return targetDate.getTime();
}

/**
 * Returns a human-friendly countdown string for a target scheduled date/time.
 */
export function getCountdownText(dateStr?: string, timeStr?: string): string {
  const targetMs = parseDateTimeToMs(dateStr, timeStr);
  if (!targetMs) return '';

  const nowMs = Date.now();
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) return 'Overdue / Due now';

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * Returns current date formatted as YYYY-MM-DD.
 */
export function formatDateIso(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
