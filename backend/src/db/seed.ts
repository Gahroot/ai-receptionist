import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { hashPassword } from '../lib/password.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding database...');

  // 1. Create test user
  const passwordHash = await hashPassword('password123');
  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'test@example.com',
      passwordHash,
      fullName: 'Test User',
      phoneNumber: '+15551234567',
    })
    .onConflictDoNothing()
    .returning();

  if (!user) {
    console.log('User already exists, skipping seed.');
    await client.end();
    return;
  }
  console.log(`Created user: ${user.email} (id: ${user.id})`);

  // 2. Create workspace
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: 'Test Business',
      slug: 'test-business',
      industry: 'Technology',
      description: 'A test workspace for development',
    })
    .returning();
  console.log(`Created workspace: ${workspace.name} (id: ${workspace.id})`);

  // 3. Create membership
  await db.insert(schema.workspaceMemberships).values({
    userId: user.id,
    workspaceId: workspace.id,
    role: 'owner',
    isDefault: true,
  });
  console.log('Created workspace membership');

  // 4. Create AI agent
  const [agent] = await db
    .insert(schema.agents)
    .values({
      workspaceId: workspace.id,
      name: 'Receptionist',
      voiceId: 'Ara',
      voiceProvider: 'grok',
      systemPrompt:
        'You are a friendly and professional AI receptionist for Test Business, a technology company. ' +
        'Answer calls politely, take messages, and help callers with their inquiries. ' +
        'If someone asks about business hours, we are open Monday through Friday, 9 AM to 5 PM.',
      initialGreeting:
        'Hello! Thank you for calling Test Business. How can I help you today?',
      temperature: 0.7,
      maxTokens: 1024,
    })
    .returning();
  console.log(`Created agent: ${agent.name} (id: ${agent.id})`);

  // 4b. Create phone number
  await db.insert(schema.phoneNumbers).values({
    workspaceId: workspace.id,
    phoneNumber: '+12485309314',
    label: 'Main Line',
    provider: 'telnyx',
    agentId: agent.id,
  });
  console.log('Created phone number: +12485309314');

  // 5. Create sample contacts
  const contactData = [
    { firstName: 'John', lastName: 'Smith', phone: '+15551000001', email: 'john@example.com', company: 'Acme Corp' },
    { firstName: 'Jane', lastName: 'Doe', phone: '+15551000002', email: 'jane@example.com', company: 'TechStart Inc' },
    { firstName: 'Bob', lastName: 'Wilson', phone: '+15551000003', email: 'bob@example.com', company: 'Design Co' },
    { firstName: 'Alice', lastName: 'Johnson', phone: '+15551000004', email: 'alice@example.com', company: 'Data Labs' },
    { firstName: 'Charlie', lastName: 'Brown', phone: '+15551000005', email: 'charlie@example.com', company: 'CloudSync' },
  ];

  const createdContacts = await db
    .insert(schema.contacts)
    .values(
      contactData.map((c) => ({
        workspaceId: workspace.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        company: c.company,
        tags: [],
      }))
    )
    .returning();
  console.log(`Created ${createdContacts.length} contacts`);

  // 6. Create sample calls
  const callData = [
    {
      direction: 'inbound' as const,
      status: 'completed',
      durationSeconds: 120,
      fromNumber: '+15551000001',
      toNumber: '+15559999999',
      contactId: createdContacts[0].id,
      agentId: agent.id,
      transcript: JSON.stringify([
        { role: 'assistant', text: 'Hello! Thank you for calling Test Business. How can I help you today?' },
        { role: 'user', text: 'Hi, I\'d like to schedule a meeting for next week.' },
        { role: 'assistant', text: 'I\'d be happy to help you schedule a meeting. What day works best for you?' },
        { role: 'user', text: 'How about Tuesday at 2 PM?' },
        { role: 'assistant', text: 'Tuesday at 2 PM sounds great. I\'ll note that down. Is there anything else I can help with?' },
        { role: 'user', text: 'No, that\'s all. Thank you!' },
        { role: 'assistant', text: 'You\'re welcome! Have a great day. Goodbye!' },
      ]),
    },
    {
      direction: 'inbound' as const,
      status: 'completed',
      durationSeconds: 45,
      fromNumber: '+15551000002',
      toNumber: '+15559999999',
      contactId: createdContacts[1].id,
      agentId: agent.id,
      isVoicemail: true,
      voicemailTranscription: 'Hi, this is Jane from TechStart. I was calling about the partnership proposal. Please call me back when you get a chance.',
    },
    {
      direction: 'inbound' as const,
      status: 'completed',
      durationSeconds: 180,
      fromNumber: '+15551000003',
      toNumber: '+15559999999',
      contactId: createdContacts[2].id,
      agentId: agent.id,
    },
  ];

  const createdCalls = await db
    .insert(schema.calls)
    .values(
      callData.map((c) => ({
        workspaceId: workspace.id,
        ...c,
      }))
    )
    .returning();
  console.log(`Created ${createdCalls.length} calls`);

  // 7. Create call summary for the first call
  await db.insert(schema.callSummaries).values({
    callId: createdCalls[0].id,
    summary: 'Caller wanted to schedule a meeting for next Tuesday at 2 PM. Meeting was confirmed.',
    keyTopics: ['meeting', 'scheduling'],
    actionItems: [
      { type: 'follow_up', label: 'Confirm Tuesday 2 PM meeting with John Smith' },
    ],
    sentiment: 'positive',
  });
  console.log('Created call summary');

  // 8. Create sample conversation
  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      workspaceId: workspace.id,
      contactPhone: '+15551000004',
      workspacePhone: '+15559999999',
      channel: 'sms',
      status: 'active',
      aiEnabled: true,
      contactId: createdContacts[3].id,
    })
    .returning();

  await db.insert(schema.messages).values([
    {
      conversationId: conversation.id,
      direction: 'inbound',
      channel: 'sms',
      body: 'Hi, do you have any availability this week?',
      status: 'delivered',
      isAi: false,
    },
    {
      conversationId: conversation.id,
      direction: 'outbound',
      channel: 'sms',
      body: 'Hello! Yes, we have openings on Wednesday and Thursday. Would either of those work for you?',
      status: 'delivered',
      isAi: true,
      agentId: agent.id,
    },
    {
      conversationId: conversation.id,
      direction: 'inbound',
      channel: 'sms',
      body: 'Wednesday would be perfect. What times are available?',
      status: 'delivered',
      isAi: false,
    },
  ]);
  console.log('Created sample conversation with messages');

  // 9. Create business hours
  await db.insert(schema.businessHours).values({
    workspaceId: workspace.id,
    is24_7: false,
    schedule: {
      monday: { enabled: true, open: '09:00', close: '17:00' },
      tuesday: { enabled: true, open: '09:00', close: '17:00' },
      wednesday: { enabled: true, open: '09:00', close: '17:00' },
      thursday: { enabled: true, open: '09:00', close: '17:00' },
      friday: { enabled: true, open: '09:00', close: '17:00' },
      saturday: { enabled: false, open: '09:00', close: '17:00' },
      sunday: { enabled: false, open: '09:00', close: '17:00' },
    },
  });
  console.log('Created business hours');

  console.log('\nSeed complete!');
  console.log(`\nLogin credentials:\n  Email: test@example.com\n  Password: password123`);

  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
