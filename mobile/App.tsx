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
