import {
  pgTable,
  serial,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  real,
} from 'drizzle-orm/pg-core';

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
  notificationPrefs: jsonb('notification_prefs').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  industry: varchar('industry', { length: 100 }),
  settings: jsonb('settings').default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workspace Memberships ────────────────────────────────────────────────────

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull().default('owner'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_workspace').on(table.userId, table.workspaceId),
  ]
);

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull().default('Receptionist'),
  description: text('description'),
  channelMode: varchar('channel_mode', { length: 50 }).notNull().default('voice'),
  voiceProvider: varchar('voice_provider', { length: 50 }).notNull().default('grok'),
  voiceId: varchar('voice_id', { length: 100 }).notNull().default('Ara'),
  language: varchar('language', { length: 10 }).notNull().default('en'),
  systemPrompt: text('system_prompt').notNull().default(
    'You are a friendly and professional AI receptionist. Answer calls politely, take messages, and help callers with their inquiries.'
  ),
  temperature: real('temperature').notNull().default(0.7),
  maxTokens: integer('max_tokens').notNull().default(1024),
  initialGreeting: text('initial_greeting'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }).notNull(),
    company: varchar('company', { length: 255 }),
    notes: text('notes'),
    tags: text('tags').array().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_contacts_workspace').on(table.workspaceId),
    index('idx_contacts_phone').on(table.phone),
  ]
);

// ─── Calls ────────────────────────────────────────────────────────────────────

export const calls = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    direction: varchar('direction', { length: 20 }).notNull().default('inbound'),
    channel: varchar('channel', { length: 20 }).notNull().default('voice'),
    status: varchar('status', { length: 50 }).notNull().default('completed'),
    durationSeconds: integer('duration_seconds'),
    recordingUrl: text('recording_url'),
    transcript: jsonb('transcript'),
    fromNumber: varchar('from_number', { length: 50 }),
    toNumber: varchar('to_number', { length: 50 }),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    isVoicemail: boolean('is_voicemail').notNull().default(false),
    voicemailTranscription: text('voicemail_transcription'),
    isRead: boolean('is_read').notNull().default(false),
    telnyxCallControlId: varchar('telnyx_call_control_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_calls_workspace').on(table.workspaceId),
    index('idx_calls_created').on(table.createdAt),
    index('idx_calls_telnyx_ccid').on(table.telnyxCallControlId),
  ]
);

// ─── Call Summaries ───────────────────────────────────────────────────────────

export const callSummaries = pgTable('call_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id')
    .notNull()
    .unique()
    .references(() => calls.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyTopics: text('key_topics').array().default([]),
  actionItems: jsonb('action_items').default([]),
  sentiment: varchar('sentiment', { length: 20 }).notNull().default('neutral'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
    workspacePhone: varchar('workspace_phone', { length: 50 }).notNull().default(''),
    channel: varchar('channel', { length: 20 }).notNull().default('sms'),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_conversations_workspace').on(table.workspaceId),
  ]
);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: varchar('direction', { length: 20 }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull().default('sms'),
    body: text('body'),
    status: varchar('status', { length: 50 }).notNull().default('delivered'),
    isAi: boolean('is_ai').notNull().default(false),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_created').on(table.createdAt),
  ]
);

// ─── Device Tokens ────────────────────────────────────────────────────────────

export const deviceTokens = pgTable('device_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expoPushToken: varchar('expo_push_token', { length: 255 }).notNull().unique(),
  platform: varchar('platform', { length: 20 }).notNull().default('ios'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Business Hours ───────────────────────────────────────────────────────────

export const businessHours = pgTable('business_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  is24_7: boolean('is_24_7').notNull().default(false),
  schedule: jsonb('schedule').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Call Forwarding ──────────────────────────────────────────────────────────

export const callForwarding = pgTable('call_forwarding', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  forwardToNumber: varchar('forward_to_number', { length: 50 }),
  ringCount: integer('ring_count').notNull().default(4),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Call Scope ───────────────────────────────────────────────────────────────

export const callScope = pgTable('call_scope', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 50 }).notNull().default('everyone'),
  ringCount: integer('ring_count').notNull().default(4),
  endingMessage: text('ending_message').notNull().default(
    'Thank you for calling. Goodbye!'
  ),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Phone Numbers ───────────────────────────────────────────────────────────

export const phoneNumbers = pgTable(
  'phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    phoneNumber: varchar('phone_number', { length: 50 }).notNull().unique(),
    label: varchar('label', { length: 255 }),
    provider: varchar('provider', { length: 50 }).notNull().default('telnyx'),
    providerResourceId: varchar('provider_resource_id', { length: 255 }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_phone_numbers_workspace').on(table.workspaceId),
  ]
);

// ─── Knowledge Base (FAQ) ─────────────────────────────────────────────────────

export const knowledgeBase = pgTable(
  'knowledge_base',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_kb_workspace').on(table.workspaceId),
  ]
);
