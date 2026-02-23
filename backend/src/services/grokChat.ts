import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GrokChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

/**
 * Call xAI chat completions API (OpenAI-compatible).
 * Returns the parsed content string from choices[0].message.content.
 */
export async function grokChatCompletion(
  messages: ChatMessage[],
  options: GrokChatOptions = {}
): Promise<string> {
  if (!config.xaiApiKey) {
    throw new AppError(502, 'xAI API key is not configured');
  }

  const {
    model = 'grok-3-mini',
    temperature = 0.3,
    max_tokens = 2048,
    response_format,
  } = options;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (response_format) {
    body.response_format = response_format;
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.xaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Grok chat completion error:', response.status, errorText);
    throw new AppError(502, 'Failed to get response from Grok AI');
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError(502, 'Empty response from Grok AI');
  }

  return content;
}
