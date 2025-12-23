import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import Storage from "../storage";
import api from "../api"; // added import
import Constants from 'expo-constants';
import theme, { COLORS } from '../theme';

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Błąd", "Podaj email i hasło.");
      return;
    }

    // Simple reachability check: ping configured API base once
    try {
      console.log('Login: pinging configured API base', api.defaults.baseURL);
      await api.get('/', { timeout: 3000 });
    } catch (pingErr: any) {
      console.error('Backend reachability check failed', pingErr?.message || pingErr);
      Alert.alert(
        'Błąd sieci',
        `Nie udało się połączyć z backendem na adresie ${api.defaults.baseURL}.\n\nUpewnij się, że backend (uvicorn) działa i że urządzenie/emulator ma dostęp do hosta.\nDla emulatora Android użyj 10.0.2.2:8000, dla Genymotion 10.0.3.2:8000, dla fizycznego urządzenia ustaw EXPO_API_URL na IP komputera.`
      );
      return;
    }

    try {
      // Use the JSON login endpoint which is simpler for mobile clients
      const res = await api.post("/login-json/", { username: email, password });

      if (!res || res.status !== 200) {
        console.warn("Login returned non-200 status", res?.status, res?.data);
        Alert.alert("Błąd logowania", "Nieprawidłowe dane logowania.");
        return;
      }

      const data = res.data;
      console.log("✅ Otrzymany token:", data.access_token);

      await Storage.setItem("token", data.access_token);
      // Also set axios default header immediately so subsequent requests in this session include the token
      try {
        api.defaults.headers.common = api.defaults.headers.common || {};
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        console.log('api.defaults Authorization set');
      } catch (e) {
        // ignore
      }
      onLogin(data.access_token);
    } catch (e: any) {
      console.error("❌ Login error:", e);
      // If it's a network error, give a clearer hint
      if (e?.message && e.message.toLowerCase().includes("network")) {
        Alert.alert(
          "Błąd sieci",
          "Nie udało się połączyć z serwerem. Sprawdź, czy urządzenie i komputer są w tej samej sieci, albo ustaw EXPO_API_URL."
        );
      } else if (e?.response && e.response.status === 401) {
        Alert.alert("Błąd logowania", "Nieprawidłowy email lub hasło (401).");
      } else {
        Alert.alert("Błąd", "Nie udało się zalogować. Spróbuj ponownie.");
      }
    }
  };

  return (
    <View style={theme.page}>
      <View style={[theme.card, { marginTop: 40 }]}>
        <Text style={theme.headerTitle}>🔑 Zaloguj się</Text>
        <Text style={theme.headerSubtitle}>Witaj — zarządzaj serwisami, tankowaniami i kosztami</Text>

        <TextInput
          style={theme.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={theme.input}
          placeholder="Hasło"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={theme.primaryBtn} onPress={handleLogin}>
          <Text style={theme.primaryBtnText}>Zaloguj</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => Alert.alert('Reset hasła', 'Funkcjonalność niezaimplementowana jeszcze')}>
          <Text style={theme.smallLink}>Nie pamiętasz hasła?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
