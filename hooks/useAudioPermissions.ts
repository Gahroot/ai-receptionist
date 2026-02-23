import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';

export function useAudioPermissions() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    // Skip permission check on web - browser handles mic permissions via getUserMedia
    if (Platform.OS === 'web') {
      setHasPermission(true); // Assume granted on web, will prompt when needed
      return;
    }

    ExpoAudioStreamModule.getPermissionsAsync()
      .then((result: { granted: boolean }) => {
        setHasPermission(result.granted);
      })
      .catch(() => {
        // Permission check failed — leave hasPermission as null
      });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // On web, browser will handle permission prompt via getUserMedia
    if (Platform.OS === 'web') {
      setHasPermission(true);
      return true;
    }

    const result = await ExpoAudioStreamModule.requestPermissionsAsync();
    setHasPermission(result.granted);

    if (!result.granted && result.canAskAgain === false) {
      Alert.alert(
        'Microphone Permission Required',
        'Please enable microphone access in Settings to make voice calls.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    }

    return result.granted;
  }, []);

  return { hasPermission, requestPermission };
}
