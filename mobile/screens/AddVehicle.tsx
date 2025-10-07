import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import api from "../api";

interface Props {
  onVehicleAdded: () => void;
}

export default function AddVehicleScreen({ onVehicleAdded }: Props) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registration, setRegistration] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddVehicle = async () => {
    if (!make || !model) {
      Alert.alert("Błąd", "Podaj co najmniej markę i model.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/vehicles/", {
        make,
        model,
        year: year ? parseInt(year) : null,
        registration: registration || null,
      });

      Alert.alert("Sukces", "Pojazd został dodany!");
      setMake("");
      setModel("");
      setYear("");
      setRegistration("");
      onVehicleAdded(); // wróć do listy i odśwież
    } catch (err: any) {
      console.error("❌ Błąd dodawania pojazdu:", err.response?.data || err.message);
      Alert.alert("Błąd", "Nie udało się dodać pojazdu. Sprawdź połączenie lub token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>➕ Dodaj pojazd</Text>

      <TextInput
        style={styles.input}
        placeholder="Marka (np. Toyota)"
        value={make}
        onChangeText={setMake}
      />

      <TextInput
        style={styles.input}
        placeholder="Model (np. Corolla)"
        value={model}
        onChangeText={setModel}
      />

      <TextInput
        style={styles.input}
        placeholder="Rok produkcji"
        keyboardType="numeric"
        value={year}
        onChangeText={setYear}
      />

      <TextInput
        style={styles.input}
        placeholder="Numer rejestracyjny"
        value={registration}
        onChangeText={setRegistration}
      />

      <Button
        title={loading ? "Dodawanie..." : "Dodaj pojazd"}
        onPress={handleAddVehicle}
        disabled={loading}
      />

      <View style={{ marginTop: 20 }}>
        <Button title="⬅️ Powrót" onPress={onVehicleAdded} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
});
