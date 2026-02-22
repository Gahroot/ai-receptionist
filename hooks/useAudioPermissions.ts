import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { ExpoAudioStreamModule } from '@siteed/expo-audio-stream';

export function useAudioPermissions() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    ExpoAudioStreamModule.getPermissionsAsync().then((result: { granted: boolean }) => {
      setHasPermission(result.granted);
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
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
