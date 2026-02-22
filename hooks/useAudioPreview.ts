import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

export function useAudioPreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // ignore cleanup errors
      }
      soundRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    await unloadSound();
    setPlayingId(null);
    setIsLoading(false);
  }, [unloadSound]);

  const play = useCallback(
    async (voiceId: string, url: string) => {
      // Stop any currently playing preview
      await unloadSound();

      if (playingId === voiceId) {
        // Toggle off if same voice
        setPlayingId(null);
        return;
      }

      setIsLoading(true);
      setPlayingId(voiceId);

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setPlayingId(null);
              soundRef.current = null;
            }
          }
        );
        soundRef.current = sound;
      } catch {
        setPlayingId(null);
      } finally {
        setIsLoading(false);
      }
    },
    [playingId, unloadSound]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unloadSound();
    };
  }, [unloadSound]);

  return { playingId, isLoading, play, stop };
}
