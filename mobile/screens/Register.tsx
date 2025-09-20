import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import api from "../api";

export default function RegisterScreen({ onRegister }: { onRegister: () => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleRegister = async () => {
        try {
            await api.post(
                "/register/",
                { email, password },
                { headers: { "Content-Type": "application/json" } }
            );
            Alert.alert("Sukces", "Konto utworzone! Możesz się zalogować.");
            onRegister();
        } catch (err) {
            Alert.alert("Błąd", "Nie udało się zarejestrować");
            console.error(err);
        }
    };


    return (
        <View style={styles.container}>
            <Text style={styles.title}>Rejestracja</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Hasło"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />
            <Button title="Zarejestruj" onPress={handleRegister} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 20 },
    title: { fontSize: 22, marginBottom: 20, textAlign: "center" },
    input: { borderWidth: 1, padding: 10, marginBottom: 15, borderRadius: 5 },
});
