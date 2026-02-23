/**
 * AI SMS auto-reply service.
 *
 * Uses xAI chat completion (Grok) to generate a reply, sends it via Telnyx SMS,
 * and saves the outbound message record.
 */

import { db } from '../db/index.js';
import { agents, messages, conversations, knowledgeBase } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { grokChatCompletion } from './grokChat.js';
import { sendSms } from './telnyxApi.js';

interface ConversationRow {
  id: string;
  workspaceId: string;
  contactPhone: string;
  workspacePhone: string;
}

interface PhoneRecord {
  agentId: string | null;
  workspaceId: string;
}

interface ContactRow {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

/**
 * Generate an AI reply to an inbound SMS and send it.
 */
export async function generateAndSendAiReply(
  conversation: ConversationRow,
  inboundText: string,
  phoneRecord: PhoneRecord,
  contact: ContactRow | null,
): Promise<void> {
  if (!phoneRecord.agentId) {
    console.warn(`[ai-sms] No agent assigned to phone number for workspace ${conversation.workspaceId}`);
    return;
  }

  // 1. Fetch agent config
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, phoneRecord.agentId))
    .limit(1);

  if (!agent) {
    console.warn(`[ai-sms] Agent ${phoneRecord.agentId} not found`);
    return;
  }

  // 2. Fetch recent messages for conversation context
  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  // Reverse to chronological order
  recentMessages.reverse();

  // 3. Fetch knowledge base FAQ entries
  const faqEntries = await db
    .select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.workspaceId, conversation.workspaceId));

  // 4. Build system prompt
  let systemPrompt = agent.systemPrompt;
  systemPrompt += '\n\nYou are responding via SMS text message. Keep your responses concise and helpful (1-3 sentences max). Do not use markdown formatting.';

  if (contact) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
    if (name) {
      systemPrompt += `\n\nYou are texting with ${name}${contact.company ? ` from ${contact.company}` : ''}.`;
    }
  }

  if (faqEntries.length > 0) {
    systemPrompt += '\n\nFrequently Asked Questions:';
    for (const faq of faqEntries) {
      systemPrompt += `\nQ: ${faq.question}\nA: ${faq.answer}`;
    }
  }

  // 5. Build chat messages array
  const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of recentMessages) {
    if (!msg.body) continue;
    chatMessages.push({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.body,
    });
  }

  // Add the current inbound message if not already included
  if (recentMessages.length === 0 || recentMessages[recentMessages.length - 1]?.body !== inboundText) {
    chatMessages.push({ role: 'user', content: inboundText });
  }

  // 6. Call xAI chat completion
  const replyText = await grokChatCompletion(chatMessages, {
    model: 'grok-3-mini-fast',
    temperature: agent.temperature,
    max_tokens: 256,
  });

  if (!replyText.trim()) {
    console.warn('[ai-sms] Empty reply from Grok, skipping');
    return;
  }

  // 7. Send SMS via Telnyx
  await sendSms(conversation.workspacePhone, conversation.contactPhone, replyText);

  // 8. Save outbound message record
  await db.insert(messages).values({
    conversationId: conversation.id,
    direction: 'outbound',
    channel: 'sms',
    body: replyText,
    status: 'sent',
    isAi: true,
    agentId: agent.id,
  });

  // 9. Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  console.log(`[ai-sms] Auto-reply sent for conversation ${conversation.id}`);
}
