import 'react-native-reanimated';
import 'react-native-gesture-handler';
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Button, BackHandler, Platform } from "react-native";
import Storage from "./storage";
import LoginScreen from "./screens/Login";
import RegisterScreen from "./screens/Register";
import VehiclesScreen from "./screens/Vehicles";

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
        }
      } catch (e) {
        // ignore if require isn't available in this environment
      }
      setLoading(false);
    };
    loadToken();
  }, []);

  const handleLogout = async () => {
    await Storage.removeItem("token");
    setToken(null);
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

    if (Platform.OS === 'android') {
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
