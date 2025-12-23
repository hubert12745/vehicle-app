import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import api, { updateService, deleteService } from "../api";

interface AddServiceScreenProps {
  vehicleId: number;
  onServiceAdded: (patch?: any) => void; // accept optional patch object
  existingEntry?: any | null;
  onCancel?: () => void;
}

export default function AddServiceScreen({ vehicleId, onServiceAdded, existingEntry = null, onCancel }: AddServiceScreenProps) {
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
        try {
          await api.get(`/service/${existingEntry.id}`);
        } catch (e: any) {
          if (e?.response?.status === 404) {
            Alert.alert('Błąd', 'Wpis serwisowy nie istnieje na serwerze. Odświeżam listę.');
            onServiceAdded();
            return;
          }
          throw e;
        }

        console.log('Updating service', existingEntry.id, payload);
        try {
          const resp = await updateService(existingEntry.id, payload);
          // updateService uses POST /service/upsert and returns created/updated item
          if (resp && (resp.status === 200 || resp.status === 201)) {
            const item = resp.data;
            Alert.alert('Sukces', 'Wpis serwisowy zaktualizowany');
            onServiceAdded(item);
            return;
          }
        } catch (err: any) {
          console.error('Update service failed:', err.response?.data || err.message);
          if (err?.response?.status === 404) {
            try {
              const dbg = await api.get('/debug/service-ids');
              console.log('Debug service ids:', dbg.data);
              Alert.alert('Błąd', 'Wpis nie znaleziony na serwerze. Spróbuję utworzyć nowy wpis zamiast aktualizacji.');
            } catch (dbgErr: any) {
              console.error('Failed to fetch debug/service-ids:', dbgErr?.response?.data || dbgErr?.message);
            }
            try {
              const createResp = await api.post('/service/', payload);
              console.log('Fallback create succeeded:', createResp?.data);
              Alert.alert('Utworzono nowy wpis', 'Oryginalny wpis nie istniał, utworzono nowy wpis serwisowy.');
              onServiceAdded(createResp?.data);
              return;
            } catch (createErr: any) {
              console.error('Fallback create failed:', createErr?.response?.data || createErr?.message);
              Alert.alert('Błąd', 'Nie udało się utworzyć nowego wpisu.');
              onServiceAdded();
              return;
            }
          }
          throw err;
        }
      } else {
        const createResp = await api.post("/service/", payload);
        if (createResp && (createResp.status === 201 || createResp.status === 200)) {
          const item = createResp.data;
          Alert.alert("Sukces", "Dane serwisowe zostały dodane!");
          setTitle("");
          setDescription("");
          setCost("");
          setDate(new Date());
          setNextDueDate(null);
          onServiceAdded(item);
          return;
        }
      }

      // Fallback to simple behavior
      Alert.alert("Sukces", "Dane serwisowe zostały dodane!");
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
              const res = await deleteService(existingEntry.id);
              if (res && (res.status === 200 || res.status === 204)) {
                Alert.alert('Usunięto', 'Wpis serwisowy został usunięty.');
                onServiceAdded({ id: existingEntry.id, _deleted: true });
                return;
              } else if (res && res.status === 404) {
                Alert.alert('Błąd', 'Wpis nie istniał. Odświeżam listę.');
                onServiceAdded();
                return;
              }
              Alert.alert('Błąd', 'Nie udało się usunąć wpisu.');
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
      <Text style={styles.title}>{existingEntry ? 'Edytuj serwis' : 'Dodaj serwis'}</Text>

      <Text style={styles.labelSmall}>Tytuł</Text>
      <TextInput style={styles.input} placeholder="np. Wymiana oleju" value={title} onChangeText={setTitle} />

      <Text style={styles.labelSmall}>Opis</Text>
      <TextInput style={[styles.input, { height: 100 }]} placeholder="Opis prac" value={description} onChangeText={setDescription} multiline />

      <Text style={styles.labelSmall}>Koszt (PLN)</Text>
      <TextInput style={styles.input} placeholder="PLN" keyboardType="numeric" value={cost} onChangeText={setCost} />

      <View style={{ marginTop: 8 }}>
        <Text style={styles.labelSmall}>Data serwisu</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateBtnText}>{date.toDateString()}</Text>
        </TouchableOpacity>
      </View>
      {showDatePicker && (
        <DateTimePicker value={date} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={handleDateChange} />
      )}

      <View style={{ marginTop: 8 }}>
        <Text style={styles.labelSmall}>Następny serwis (opcjonalnie)</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowNextDuePicker(true)}>
          <Text style={styles.dateBtnText}>{nextDueDate ? nextDueDate.toDateString() : 'Ustaw datę'}</Text>
        </TouchableOpacity>
      </View>
      {showNextDuePicker && (
        <DateTimePicker value={nextDueDate || new Date()} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={handleNextDueChange} />
      )}

      <View style={{ marginTop: 12 }}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleAddService} disabled={loading}>
          <Text style={styles.primaryBtnText}>{loading ? (existingEntry ? 'Aktualizowanie...' : 'Dodawanie...') : (existingEntry ? 'Zapisz zmiany' : 'Dodaj serwis')}</Text>
        </TouchableOpacity>

        {existingEntry && (
          <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={loading}>
              <Text style={styles.deleteBtnText}>Usuń</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => { if (onCancel) { try { onCancel(); } catch (e) {} try { onServiceAdded(); } catch (e) {} } else onServiceAdded(); }}>
              <Text style={styles.ghostBtnText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        )}

        {!existingEntry && (
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => { if (onCancel) { try { onCancel(); } catch (e) {} try { onServiceAdded(); } catch (e) {} } else onServiceAdded(); }}>
              <Text style={styles.ghostBtnText}>Wróć</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f8fb' },
  title: { fontSize: 20, fontWeight: '700', color: '#2c3e50', textAlign: 'center', marginBottom: 12 },
  labelSmall: { color: '#7f8c8d', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e3e6ea', borderRadius: 8, padding: 10, backgroundColor: '#fff' },

  dateBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e3e6ea' },
  dateBtnText: { color: '#34495e', fontWeight: '600' },

  primaryBtn: { marginTop: 8, backgroundColor: '#2e86de', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },

  deleteBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  deleteBtnText: { color: '#e74c3c', fontWeight: '700' },

  ghostBtn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginLeft: 12, borderWidth: 1, borderColor: '#e3e6ea' },
  ghostBtnText: { color: '#34495e', fontWeight: '700' },
});