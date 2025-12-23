import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import api from "../api";
import theme from '../theme';

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
        <View style={theme.page}>
          <View style={[theme.card, { marginTop: 40 }]}>
            <Text style={theme.headerTitle}>Zarejestruj się</Text>
            <Text style={theme.headerSubtitle}>Utwórz konto, aby zacząć śledzić koszty i serwisy</Text>

            <TextInput style={theme.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <TextInput style={theme.input} placeholder="Hasło" secureTextEntry value={password} onChangeText={setPassword} />

            <TouchableOpacity style={theme.primaryBtn} onPress={handleRegister}>
              <Text style={theme.primaryBtnText}>Zarejestruj</Text>
            </TouchableOpacity>
          </View>
        </View>
    );
}
