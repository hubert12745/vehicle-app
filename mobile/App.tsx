// Ensure EXPO_API_URL is set early so the api client can derive the correct backend host
import Constants from 'expo-constants';
import { Platform } from 'react-native';
try {
  // respect any existing override
  // @ts-ignore
  const already = (global as any).EXPO_API_URL || (process && (process.env as any)?.EXPO_API_URL);
  if (!already) {
    // expo manifests differ across SDK versions; try a few common locations
    // @ts-ignore
    const dbg = (Constants as any).manifest?.debuggerHost || (Constants as any).manifest2?.debuggerHost || (Constants as any).debuggerHost;
    if (dbg && typeof dbg === 'string') {
      const host = dbg.split(':')[0];
      // default backend port used by project
      (global as any).EXPO_API_URL = `http://${host}:8000`;
      console.log('[INIT] Set global.EXPO_API_URL from debuggerHost:', (global as any).EXPO_API_URL);
    } else if (Platform.OS === 'android') {
      // Android emulator mapping
      (global as any).EXPO_API_URL = 'http://10.0.2.2:8000';
      console.log('[INIT] Set global.EXPO_API_URL for Android emulator:', (global as any).EXPO_API_URL);
    } else {
      (global as any).EXPO_API_URL = 'http://localhost:8000';
      console.log('[INIT] Set global.EXPO_API_URL fallback:', (global as any).EXPO_API_URL);
    }
  } else {
    // @ts-ignore
    console.log('[INIT] EXPO_API_URL already set:', (global as any).EXPO_API_URL || (process && (process.env as any)?.EXPO_API_URL));
  }
} catch (e) {
  // ignore failures here; api.ts will still try other heuristics
}

import 'react-native-reanimated';
import 'react-native-gesture-handler';
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Button, BackHandler, Platform as RnPlatform } from "react-native";
import Storage from "./storage";
import LoginScreen from "./screens/Login";
import RegisterScreen from "./screens/Register";
import VehiclesScreen from "./screens/Vehicles";
import { registerForPushNotificationsAsync, startNotificationsPoll, stopNotificationsPoll } from './notifications';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const loadToken = async () => {
      const t = await Storage.getItem("token");
      setToken(t);
      // set axios default Authorization header immediately if token present
      try {
        if (t) {
          // set on api instance
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const apiModule = require('./api').default;
          apiModule.defaults.headers.common = apiModule.defaults.headers.common || {};
          apiModule.defaults.headers.common.Authorization = `Bearer ${t}`;
          console.log('App: api.defaults Authorization set from stored token');

          // register push token with backend (if device supports)
          try {
            const pushToken = await registerForPushNotificationsAsync();
            console.log('[APP] push token', pushToken);
            // start polling for notifications (local scheduling fallback)
            startNotificationsPoll();
          } catch (e) {
            console.warn('[APP] register push failed', e);
          }
        }
      } catch (e) {
        // ignore if require isn't available in this environment
      }
      setLoading(false);
    };
    loadToken();

    // cleanup on unmount
    return () => {
      try { stopNotificationsPoll(); } catch (e) {}
    };
  }, []);

  const handleLogout = async () => {
    await Storage.removeItem("token");
    setToken(null);
    try { stopNotificationsPoll(); } catch (e) {}
  };

  useEffect(() => {
    const onHardwareBack = () => {
      // If on register screen and not logged in, go back to login instead of exiting
      if (!token && showRegister) {
        setShowRegister(false);
        return true; // handled
      }
      // otherwise, allow default behavior (exit app or handled by inner screens)
      return false;
    };

    if (RnPlatform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => {
        try {
          sub.remove();
        } catch (e) {
          try { BackHandler.removeEventListener && BackHandler.removeEventListener('hardwareBackPress', onHardwareBack); } catch (_) {}
        }
      };
    }
    return;
  }, [token, showRegister]);

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1 }} />;

  if (!token) {
    return showRegister ? (
      <View style={{ flex: 1 }}>
        <RegisterScreen onRegister={() => setShowRegister(false)} />
        <Button
          title="Masz już konto? Zaloguj się"
          onPress={() => setShowRegister(false)}
        />
      </View>
    ) : (
      <View style={{ flex: 1 }}>
        <LoginScreen onLogin={(t) => setToken(t)} />
        <Button
          title="Nie masz konta? Zarejestruj się"
          onPress={() => setShowRegister(true)}
        />
      </View>
    );
  }

  // Start VehiclesScreen in focused (fokus) mode by default after login
  return <VehiclesScreen token={token} onLogout={handleLogout} initialFocusedMode={true} />;
}
