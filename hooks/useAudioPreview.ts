import { useState, useCallback, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';

export function useAudioPreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const player = useAudioPlayer(null);

  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', () => {
      if (!player.playing && playingId && player.currentTime > 0) {
        setPlayingId(null);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, playingId]);

  const stop = useCallback(async () => {
    player.pause();
    setPlayingId(null);
    setIsLoading(false);
  }, [player]);

  const play = useCallback(
    async (voiceId: string, url: string) => {
      // Stop any currently playing preview
      player.pause();

      if (playingId === voiceId) {
        // Toggle off if same voice
        setPlayingId(null);
        return;
      }

      setIsLoading(true);
      setPlayingId(voiceId);

      try {
        player.replace({ uri: url });
        player.play();
      } catch {
        setPlayingId(null);
      } finally {
        setIsLoading(false);
      }
    },
    [playingId, player]
  );

  return { playingId, isLoading, play, stop };
}
