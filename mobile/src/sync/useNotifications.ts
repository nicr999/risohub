// ============================================================
// RISO HUB Mobile — src/sync/useNotifications.ts
// FCM push notification permission + device token registration.
//
// Dependencies (add to package.json if not present):
//   @react-native-firebase/app
//   @react-native-firebase/messaging
//
// Usage: call usePushNotifications() once near the top of App.tsx
// ============================================================

import { useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';
import { api, getTokens } from '../api/client';

async function registerToken(fcmToken: string): Promise<void> {
  const tokens = await getTokens();
  if (!tokens?.accessToken) return;

  await api.post('/api/device-tokens', {
    token:    fcmToken,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
}

async function requestPermissionAndRegister(): Promise<void> {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) return;

  try {
    const fcmToken = await messaging().getToken();
    if (fcmToken) await registerToken(fcmToken);
  } catch (err) {
    console.warn('[Push] Token registration failed:', err);
  }
}

export function usePushNotifications(): void {
  const navigation = useNavigation<any>();

  useEffect(() => {
    // 1. Request permission and register current token
    requestPermissionAndRegister();

    // 2. Refresh token whenever FCM rotates it
    const unsubRefresh = messaging().onTokenRefresh(token => {
      registerToken(token).catch(() => {});
    });

    // 3. Foreground message handler — show a simple alert
    const unsubForeground = messaging().onMessage(async remoteMessage => {
      const { title, body } = remoteMessage.notification ?? {};
      if (title) {
        Alert.alert(title, body ?? '');
      }
    });

    // 4. Background/quit tap handler — navigate to the relevant project
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage?.data?.projectId) {
          navigation.navigate('ProjectDetail', {
            projectId: remoteMessage.data.projectId as string,
          });
        }
      });

    const unsubBackground = messaging().onNotificationOpenedApp(remoteMessage => {
      if (remoteMessage?.data?.projectId) {
        navigation.navigate('ProjectDetail', {
          projectId: remoteMessage.data.projectId as string,
        });
      }
    });

    return () => {
      unsubRefresh();
      unsubForeground();
      unsubBackground();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
