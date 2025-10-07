import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert, StyleSheet } from "react-native";
import Storage from "../storage";

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Błąd", "Podaj email i hasło.");
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("username", email); // backend oczekuje "username"
      params.append("password", password);

      const res = await fetch("http://localhost:8000/login/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!res.ok) {
        Alert.alert("Błąd logowania", "Nieprawidłowe dane logowania.");
        return;
      }

      const data = await res.json();
      console.log("✅ Otrzymany token:", data.access_token);

      await Storage.setItem("token", data.access_token);
      onLogin(data.access_token);
    } catch (e) {
      console.error("❌ Login error:", e);
      Alert.alert("Błąd", "Nie udało się zalogować. Spróbuj ponownie.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔑 Logowanie</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Hasło"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Zaloguj" onPress={handleLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  title: { fontSize: 22, marginBottom: 20, textAlign: "center", fontWeight: "bold" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
});
