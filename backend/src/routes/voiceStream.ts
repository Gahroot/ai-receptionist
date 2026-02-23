/**
 * WebSocket server for Telnyx media streams.
 * Uses `ws` with `noServer: true`, intercepts HTTP upgrades on /voice/stream/:callControlId.
 */

import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { db } from '../db/index.js';
import { calls } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { VoiceBridge, activeCalls } from '../services/voiceBridge.js';

const STREAM_PATH_PREFIX = '/voice/stream/';

/**
 * Attach the voice stream WebSocket server to an existing HTTP server.
 */
export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = request.url ?? '';

    if (!url.startsWith(STREAM_PATH_PREFIX)) {
      // Not our route — let other upgrade handlers deal with it, or destroy
      socket.destroy();
      return;
    }

    const callControlId = url.slice(STREAM_PATH_PREFIX.length).split('?')[0];
    if (!callControlId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[ws] Telnyx stream connected: ${callControlId}`);

      // Look up call record and start bridge
      handleConnection(callControlId, ws).catch((err) => {
        console.error(`[ws] Bridge setup failed for ${callControlId}:`, err);
        ws.close();
      });
    });
  });

  console.log('[ws] Voice stream WebSocket server attached');
}

async function handleConnection(
  callControlId: string,
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
  await bridge.start(ws);
}
