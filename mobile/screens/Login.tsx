import React, { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";
import Storage from "../storage";

type Props = {
  onLogin: (token: string) => void;
};

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const res = await fetch("http://localhost:8000/login/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        Alert.alert("Błąd logowania", "Sprawdź dane");
        return;
      }

      const data = await res.json();
      console.log("TOKEN:", data.access_token);

      // zapisz token
      await Storage.setItem("token", data.access_token);
      onLogin(data.access_token);
    } catch (e) {
      console.error(e);
      Alert.alert("Błąd", "Nie udało się zalogować");
    }
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput
        placeholder="Hasło"
        value={password}
        secureTextEntry
        onChangeText={setPassword}
      />
      <Button title="Zaloguj" onPress={handleLogin} />
    </View>
  );
}
