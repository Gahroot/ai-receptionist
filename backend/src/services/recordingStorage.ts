/**
 * Local filesystem storage for call recordings.
 * Downloads from Telnyx temp URLs and saves to the configured recordings directory.
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

let dirReady = false;

/** Ensure the recordings directory exists. */
async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(config.recordingsDir, { recursive: true });
  dirReady = true;
}

/**
 * Download a recording from a URL and save it locally.
 * Returns the filename (e.g. `{callId}.wav`).
 */
export async function uploadRecordingFromUrl(
  url: string,
  callId: string,
  format = 'wav',
): Promise<string> {
  await ensureDir();

  const filename = `${callId}.${format}`;
  const filePath = path.join(config.recordingsDir, filename);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download recording: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buffer);

  console.log(`[recording] Saved ${filename} (${buffer.length} bytes)`);
  return filename;
}

/** Resolve a recording filename to an absolute path. */
export function getRecordingPath(filename: string): string {
  return path.resolve(config.recordingsDir, filename);
}
