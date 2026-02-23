/**
 * Business hours utility — checks if the current time falls within
 * configured business hours for a workspace.
 */

import { db } from '../db/index.js';
import { businessHours } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface DaySchedule {
  enabled: boolean;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

type WeekSchedule = Record<string, DaySchedule>;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Parse "HH:mm" to minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if the current time falls within configured business hours.
 * Returns `true` if calls should be accepted (within hours or no restrictions).
 */
export async function isWithinBusinessHours(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.workspaceId, workspaceId))
    .limit(1);

  // No business hours configured → always open
  if (!row) return true;

  // 24/7 mode
  if (row.is24_7) return true;

  const schedule = row.schedule as WeekSchedule | null;
  if (!schedule || Object.keys(schedule).length === 0) return true;

  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const daySchedule = schedule[dayName];

  // Day not in schedule or not enabled → closed
  if (!daySchedule || !daySchedule.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeToMinutes(daySchedule.start);
  const endMinutes = timeToMinutes(daySchedule.end);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
