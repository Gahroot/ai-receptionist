/**
 * Telnyx REST client — direct fetch() calls to v2 API (no SDK).
 */

import { config } from '../config.js';

const BASE_URL = 'https://api.telnyx.com/v2';

async function telnyxPost(path: string, body?: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.telnyxApiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Telnyx API error ${res.status} on ${path}:`, text);
    throw new Error(`Telnyx API ${res.status}: ${text}`);
  }
}

/** Answer an incoming call, optionally starting streaming in the same command. */
export async function answerCall(
  callControlId: string,
  streamUrl?: string,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (streamUrl) {
    body.stream_url = streamUrl;
    body.stream_track = 'inbound_track';
    body.stream_bidirectional_mode = 'rtp';
    body.stream_bidirectional_codec = 'PCMU';
  }
  await telnyxPost(
    `/calls/${callControlId}/actions/answer`,
    Object.keys(body).length > 0 ? body : undefined,
  );
  console.log(`[telnyx] Answered call ${callControlId}${streamUrl ? ` + streaming → ${streamUrl}` : ''}`);
}

/** Hang up a call. */
export async function hangupCall(callControlId: string): Promise<void> {
  try {
    await telnyxPost(`/calls/${callControlId}/actions/hangup`);
    console.log(`[telnyx] Hung up call ${callControlId}`);
  } catch (err) {
    console.error(`[telnyx] Hangup failed for ${callControlId}:`, err);
  }
}

/** Start bidirectional audio streaming on a call. */
export async function startStreaming(
  callControlId: string,
  streamUrl: string,
): Promise<void> {
  await telnyxPost(`/calls/${callControlId}/actions/streaming_start`, {
    stream_url: streamUrl,
    stream_track: 'inbound_track',
    stream_bidirectional_mode: 'rtp',
    stream_bidirectional_codec: 'PCMU',
  });
  console.log(`[telnyx] Started streaming for ${callControlId} → ${streamUrl}`);
}

/** Build the WebSocket stream URL. */
export function buildStreamUrl(): string {
  const base = config.apiBaseUrl.replace(/^http/, 'ws');
  return `${base}/voice/stream`;
}
