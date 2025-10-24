import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import DatePicker from "react-native-date-picker";
import api from "../api";

interface AddServiceScreenProps {
  vehicleId: number;
  onServiceAdded: () => void;
}

export default function AddServiceScreen({ vehicleId, onServiceAdded }: AddServiceScreenProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(new Date()); // Service date
  const [nextDueDate, setNextDueDate] = useState<Date | null>(null); // Optional next due date
  const [loading, setLoading] = useState(false);

  const handleAddService = async () => {
    if (!title || !description || !cost) {
      Alert.alert("Błąd", "Wypełnij wszystkie pola.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/service/", {
        vehicle_id: vehicleId,
        type: title,
        description,
        cost: parseFloat(cost),
        date: date.toISOString(),
        next_due_date: nextDueDate ? nextDueDate.toISOString() : null,
      });

      Alert.alert("Sukces", "Dane serwisowe zostały dodane!");
      setTitle("");
      setDescription("");
      setCost("");
      setDate(new Date());
      setNextDueDate(null);
      onServiceAdded();
    } catch (err: any) {
      console.error("❌ Błąd dodawania serwisu:", err.response?.data || err.message);
      Alert.alert("Błąd", "Nie udało się dodać danych serwisowych. Sprawdź połączenie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>➕ Dodaj serwis</Text>

      <TextInput
        style={styles.input}
        placeholder="Tytuł (np. Wymiana oleju)"
        value={title}
        onChangeText={setTitle}
      />

      <TextInput
        style={styles.input}
        placeholder="Opis (np. Wymieniono filtr oleju, klocki hamulcowe)"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TextInput
        style={styles.input}
        placeholder="Koszt (PLN)"
        keyboardType="numeric"
        value={cost}
        onChangeText={setCost}
      />

      <Text style={styles.label}>Data serwisu:</Text>
      <DatePicker date={date} onDateChange={setDate} mode="date" />

      <Text style={styles.label}>Następny serwis (opcjonalnie):</Text>
      <DatePicker date={nextDueDate || new Date()} onDateChange={setNextDueDate} mode="date" />

      <Button
        title={loading ? "Dodawanie..." : "Dodaj serwis"}
        onPress={handleAddService}
        disabled={loading}
      />

      <View style={{ marginTop: 20 }}>
        <Button title="⬅️ Powrót" onPress={onServiceAdded} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  label: { fontSize: 16, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
});