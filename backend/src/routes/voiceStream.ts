/**
 * WebSocket server for Telnyx media streams.
 * Uses `ws` with `noServer: true`, intercepts HTTP upgrades on /voice/stream.
 *
 * The call control ID is extracted from Telnyx's `start` event rather than
 * the URL path, avoiding URL-parsing issues with the `v3:` prefix.
 */

import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { db } from '../db/index.js';
import { calls } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { VoiceBridge, activeCalls } from '../services/voiceBridge.js';

const STREAM_PATH = '/voice/stream';

/**
 * Attach the voice stream WebSocket server to an existing HTTP server.
 */
export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = (request.url ?? '').split('?')[0];

    if (url !== STREAM_PATH) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[ws] Telnyx stream connected, waiting for start event...');

      // Wait for the Telnyx `start` event to identify the call
      const onMessage = (raw: Buffer) => {
        let msg: {
          event: string;
          stream_id?: string;
          start?: { call_control_id?: string };
        };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg.event === 'start') {
          ws.removeListener('message', onMessage);

          const callControlId = msg.start?.call_control_id;
          if (!callControlId) {
            console.error('[ws] start event missing call_control_id');
            ws.close();
            return;
          }

          console.log(`[ws] Telnyx stream identified: ${callControlId}`);
          handleConnection(callControlId, msg.stream_id ?? '', ws).catch((err) => {
            console.error(`[ws] Bridge setup failed for ${callControlId}:`, err);
            ws.close();
          });
        }
      };

      ws.on('message', onMessage);

      // Timeout if no start event within 10s
      setTimeout(() => {
        ws.removeListener('message', onMessage);
        if (ws.readyState === ws.OPEN && !ws.listenerCount('message')) {
          console.error('[ws] Timed out waiting for start event');
          ws.close();
        }
      }, 10000);
    });
  });

  console.log('[ws] Voice stream WebSocket server attached');
}

async function handleConnection(
  callControlId: string,
  streamId: string,
  ws: import('ws').WebSocket,
): Promise<void> {
  // Look up call record by telnyxCallControlId
  const [callRecord] = await db
    .select()
    .from(calls)
    .where(eq(calls.telnyxCallControlId, callControlId))
    .limit(1);

  if (!callRecord) {
    console.error(`[ws] No call record for ccid=${callControlId}`);
    ws.close();
    return;
  }

  if (!callRecord.agentId) {
    console.error(`[ws] Call ${callRecord.id} has no agent`);
    ws.close();
    return;
  }

  // Create bridge and start
  const bridge = new VoiceBridge(
    callControlId,
    callRecord.workspaceId,
    callRecord.agentId,
    callRecord.fromNumber ?? '',
    callRecord.toNumber ?? '',
    callRecord.id,
  );

  activeCalls.set(callControlId, bridge);
  await bridge.start(ws, streamId);
}
