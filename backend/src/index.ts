import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { notFound, errorHandler } from './lib/errors.js';
import { setupWebSocketServer } from './routes/voiceStream.js';

// Route imports
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import agentRoutes from './routes/agents.js';
import contactRoutes from './routes/contacts.js';
import callRoutes from './routes/calls.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';
import voiceRoutes from './routes/voice.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(cors());

// Mount Telnyx webhooks BEFORE express.json() — they need raw body for signature verification
app.use('/api/v1/webhooks/telnyx/voice', webhookRoutes);

// JSON parsing for all other routes
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

// Auth: /api/v1/auth/*
app.use('/api/v1', authRoutes);

// Workspaces: /api/v1/workspaces/*
app.use('/api/v1/workspaces', workspaceRoutes);

// Agents: /api/v1/workspaces/:workspaceId/agents/* and /api/v1/agents (legacy)
app.use('/api/v1', agentRoutes);

// Contacts: /api/v1/workspaces/:workspaceId/contacts/*
app.use('/api/v1/workspaces/:workspaceId/contacts', contactRoutes);

// Calls: /api/v1/workspaces/:workspaceId/calls/*
app.use('/api/v1/workspaces', callRoutes);

// Conversations: /api/v1/workspaces/:workspaceId/conversations/*
app.use('/api/v1', conversationRoutes);

// Settings: /api/v1/settings/*
app.use('/api/v1/settings', settingsRoutes);

// Voice: /api/v1/voice/*
app.use('/api/v1', voiceRoutes);

// Knowledge Base: /api/v1/workspaces/:workspaceId/knowledge-base/*
app.use('/api/v1/workspaces/:workspaceId/knowledge-base', knowledgeBaseRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

const server = createServer(app);
setupWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
