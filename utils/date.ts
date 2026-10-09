/**
 * Date Formatting & Conversion Utilities for KSM Pvt Ltd
 * Standard Display & User Input Format: DD-MM-YYYY (e.g. 31-12-2026)
 * Standard Database / Storage Format: YYYY-MM-DD (e.g. 2026-12-31)
 */

/**
 * Returns today's date in DD-MM-YYYY format (e.g. 08-09-2026)
 */
export function getTodayDDMMYYYY(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Returns today's date in YYYY-MM-DD format (e.g. 2026-09-08)
 */
export function getTodayYYYYMMDD(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

/**
 * Converts any date string (YYYY-MM-DD, ISO string, or DD-MM-YYYY) to DD-MM-YYYY for UI display.
 * Example: '2026-12-31' -> '31-12-2026'
 */
export function toDisplayDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return getTodayDDMMYYYY();
  const trimmed = dateStr.trim();

  // Already in DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY-MM-DD (or YYYY-MM-DDTHH:mm:ss...)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}-${m}-${y}`;
  }

  // Fallback to Date parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return trimmed;
}

/**
 * Converts user input (which can be DD-MM-YYYY or YYYY-MM-DD) to standard database format YYYY-MM-DD.
 * Example: '31-12-2026' -> '2026-12-31'
 */
export function toDbDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return getTodayYYYYMMDD();
  const trimmed = dateStr.trim();

  // If in DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day = d.padStart(2, '0');
    const month = m.padStart(2, '0');
    return `${y}-${month}-${day}`;
  }

  // If already in YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const day = d.padStart(2, '0');
    const month = m.padStart(2, '0');
    return `${y}-${month}-${day}`;
  }

  return getTodayYYYYMMDD();
}

/**
 * Validates whether an input string is a valid date in DD-MM-YYYY (or YYYY-MM-DD) format
 */
export function isValidDateInput(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();

  // Check DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 2000 || y > 2100) return false;
    return true;
  }

  // Check YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 2000 || y > 2100) return false;
    return true;
  }

  return false;
}
