export const GROK_VOICE_NAMES = ['Sal', 'Ara', 'Eve', 'Leo', 'Rex'] as const;
export type GrokVoice = (typeof GROK_VOICE_NAMES)[number];

const VOICE_MAP: Record<string, GrokVoice> = {
  alloy: 'Sal',
  shimmer: 'Ara',
  nova: 'Eve',
  echo: 'Leo',
  onyx: 'Rex',
};

export function isGrokVoice(value: string): value is GrokVoice {
  return (GROK_VOICE_NAMES as readonly string[]).includes(value);
}

export function toGrokVoice(voiceId: string): GrokVoice {
  if (isGrokVoice(voiceId)) return voiceId;
  return VOICE_MAP[voiceId.toLowerCase()] ?? 'Ara';
}
