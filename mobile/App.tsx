import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Button } from "react-native";
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

  return <VehiclesScreen token={token} onLogout={handleLogout} />;
}
