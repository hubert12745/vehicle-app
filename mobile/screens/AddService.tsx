import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import api, { updateService, deleteService } from "../api";

interface AddServiceScreenProps {
  vehicleId: number;
  onServiceAdded: () => void;
  existingEntry?: any | null;
}

export default function AddServiceScreen({ vehicleId, onServiceAdded, existingEntry = null }: AddServiceScreenProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(new Date()); // Service date
  const [nextDueDate, setNextDueDate] = useState<Date | null>(null); // Optional next due date
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNextDuePicker, setShowNextDuePicker] = useState(false);

  // If existingEntry provided, prefill fields for editing
  useEffect(() => {
    if (existingEntry) {
      setTitle(existingEntry.title || existingEntry.type || "");
      setDescription(existingEntry.description || "");
      setCost(existingEntry.cost != null ? String(existingEntry.cost) : "");
      try {
        if (existingEntry.date) setDate(new Date(existingEntry.date));
      } catch (e) {}
      try {
        if (existingEntry.next_due_date) setNextDueDate(new Date(existingEntry.next_due_date));
      } catch (e) {}
    }
  }, [existingEntry]);

  const handleAddService = async () => {
    if (!title || !description || !cost) {
      Alert.alert("Błąd", "Wypełnij wszystkie pola.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        vehicle_id: vehicleId,
        type: title,
        description,
        cost: parseFloat(cost),
        date: date.toISOString(),
        next_due_date: nextDueDate ? nextDueDate.toISOString() : null,
      };

      if (existingEntry && existingEntry.id) {
        // edit mode
        await updateService(existingEntry.id, payload);
      } else {
        await api.post("/service/", payload);
      }

      Alert.alert("Sukces", "Dane serwisowe zostały dodane!");
      setTitle("");
      setDescription("");
      setCost("");
      setDate(new Date());
      setNextDueDate(null);
      onServiceAdded();
    } catch (err: any) {
      console.error("❌ Błąd dodawania serwisu:", err.response?.data || err.message);
      const serverDetail = err?.response?.data || err?.message;
      Alert.alert("Błąd dodawania serwisu", typeof serverDetail === 'string' ? serverDetail : JSON.stringify(serverDetail));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEntry || !existingEntry.id) return;
    Alert.alert(
      'Usuń wpis',
      'Na pewno usunąć wpis serwisowy?',
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: async () => {
            setLoading(true);
            try {
              await deleteService(existingEntry.id);
              Alert.alert('Usunięto', 'Wpis serwisowy został usunięty.');
              onServiceAdded();
            } catch (e: any) {
              console.error('Błąd usuwania serwisu', e);
              Alert.alert('Błąd', e?.response?.data || e?.message || 'Nieznany błąd');
            } finally {
              setLoading(false);
            }
        } }
      ]
    );
  };

  const handleDateChange = (_event: any, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) setDate(selected);
  };

  const handleNextDueChange = (_event: any, selected?: Date) => {
    setShowNextDuePicker(false);
    if (selected) setNextDueDate(selected);
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
      <Button title={date.toDateString()} onPress={() => setShowDatePicker(true)} />
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleDateChange}
        />
      )}

      <Text style={styles.label}>Następny serwis (opcjonalnie):</Text>
      <Button title={nextDueDate ? nextDueDate.toDateString() : 'Ustaw datę następnego serwisu'} onPress={() => setShowNextDuePicker(true)} />
      {showNextDuePicker && (
        <DateTimePicker
          value={nextDueDate || new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleNextDueChange}
        />
      )}

      <View style={{ marginTop: 10 }}>
        <Button
          title={loading ? (existingEntry ? "Aktualizowanie..." : "Dodawanie...") : (existingEntry ? "Zapisz zmiany" : "Dodaj serwis")}
          onPress={handleAddService}
          disabled={loading}
        />
      </View>

      {existingEntry && (
        <View style={{ marginTop: 10 }}>
          <Button title={loading ? "Usuwanie..." : "Usuń wpis"} color="red" onPress={handleDelete} disabled={loading} />
        </View>
      )}

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