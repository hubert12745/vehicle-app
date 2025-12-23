import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import api, { deleteFuel } from "../api";

interface RefuelScreenProps {
  vehicleId: number;
  onRefuelAdded: (patch?: any) => void; // Callback to refresh data or navigate back
  existingEntry?: any; // optional entry for edit mode
  onCancel?: () => void;
}

export default function RefuelScreen({ vehicleId, onRefuelAdded, existingEntry, onCancel }: RefuelScreenProps) {
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [date, setDate] = useState(new Date()); // Refueling date
  const [showDatePicker, setShowDatePicker] = useState(false); // Control date picker visibility
  const [loading, setLoading] = useState(false);

  // If editing, prefill fields
  useEffect(() => {
    if (existingEntry) {
      setOdometer(String(existingEntry.odometer ?? ""));
      setLiters(String(existingEntry.liters ?? ""));
      setPricePerLiter(String(existingEntry.price_per_liter ?? ""));
      setTotalCost(String(existingEntry.total_cost ?? ""));
      try {
        setDate(existingEntry.date ? new Date(existingEntry.date) : new Date());
      } catch (e) {
        setDate(new Date());
      }
    }
  }, [existingEntry]);

  // Auto-calculate total cost when liters or price per liter changes
  useEffect(() => {
    if (liters && pricePerLiter) {
      const calculatedCost = (parseFloat(liters) * parseFloat(pricePerLiter)).toFixed(2);
      setTotalCost(calculatedCost);
    } else {
      setTotalCost("");
    }
  }, [liters, pricePerLiter]);

  const handleSave = async () => {
    if (!odometer || !liters || !pricePerLiter || !totalCost) {
      Alert.alert("Błąd", "Wypełnij wszystkie pola.");
      return;
    }

    setLoading(true);

    // helper to wait
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

    // prepare payload
    const payload = {
      vehicle_id: vehicleId,
      odometer: parseInt(odometer),
      liters: parseFloat(liters),
      price_per_liter: parseFloat(pricePerLiter),
      total_cost: parseFloat(totalCost),
      date: date.toISOString(),
    };

    const maxAttempts = 3;
    let attempt = 0;
    let lastError: any = null;

    try {
      while (attempt < maxAttempts) {
        try {
          let res: any;
          if (existingEntry) {
            res = await api.put(`/fuel/${existingEntry.id}`, payload);
          } else {
            res = await api.post("/fuel/", payload);
          }

          // success handling
          if (res && res.status === 202) {
            // queued: poll /debug/queue until pending is 0 or timeout
            Alert.alert('Zapis w tle', 'Twoje dane zostały umieszczone w kolejce do zapisu. Aplikacja odświeży listę gdy zapis się ukończy.');
            const start = Date.now();
            const maxWait = 15000; // 15s
            while (Date.now() - start < maxWait) {
              try {
                const q = await api.get('/debug/queue');
                if (q.data && q.data.pending_background_tasks === 0) {
                  break;
                }
              } catch (e) {
                // ignore polling errors
              }
              await wait(500);
            }
            // After waiting (or timeout) notify parent to refresh
            onRefuelAdded();
            return;
          }

          // normal success (200)
          Alert.alert("Sukces", existingEntry ? "Dane tankowania zostały zaktualizowane!" : "Dane tankowania zostały dodane!");
          // Reset fields and callback
          setOdometer("");
          setLiters("");
          setPricePerLiter("");
          setTotalCost("");
          setDate(new Date());
          // If server returned created/updated object, pass it as patch so UI can update immediately
          const returned = res?.data;
          if (returned) {
            onRefuelAdded(returned);
            return;
          }
          onRefuelAdded();
          return;
        } catch (err: any) {
          lastError = err;
          const status = err?.response?.status;
          const msg = (err && (err.message || '')).toString().toLowerCase();

          // if 503 Service Unavailable or network error -> retry
          const shouldRetry = (status === 503) || msg.includes('network') || msg.includes('timeout');

          attempt++;
          if (shouldRetry && attempt < maxAttempts) {
            const backoff = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms, ...
            console.warn(`Attempt ${attempt} failed (${status || msg}). Retrying in ${backoff}ms...`);
            await wait(backoff);
            continue;
          }

          // Otherwise break and handle error below
          break;
        }
      }

      // If we reach here, all attempts failed
      const err = lastError;
      const serverDetail = err?.response?.data || err?.response?.data?.detail || err?.message;
      console.error("❌ Błąd zapisu tankowania (after retries):", serverDetail || err);

      // Network error -> helpful hint
      const msgLower = (err && (err.message || '')).toString().toLowerCase();
      if (msgLower.includes('network')) {
        try { console.error('Axios baseURL:', api.defaults?.baseURL); } catch (_) {}
        Alert.alert(
          'Błąd sieci',
          'Nie udało się połączyć z serwerem po kilku próbach. Sprawdź, czy backend działa i czy urządzenie jest w tej samej sieci co komputer. Możesz ustawić EXPO_API_URL, np. global.EXPO_API_URL = "http://192.168.x.y:8000" w App.tsx.'
        );
      } else if (err?.response?.status === 503) {
        Alert.alert('Serwer zajęty', 'Serwer był zajęty przy zapisie. Spróbuj ponownie za kilka sekund.');
      } else {
        Alert.alert("Błąd zapisu tankowania", typeof serverDetail === 'string' ? serverDetail : JSON.stringify(serverDetail));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false); // Hide the date picker
    if (selectedDate) {
      setDate(selectedDate); // Update the selected date
    }
  };

  const handleDelete = async () => {
    if (!existingEntry || !existingEntry.id) return;
    Alert.alert(
      'Usuń wpis',
      'Na pewno usunąć wpis tankowania?',
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: async () => {
            setLoading(true);
            try {
              const res = await deleteFuel(existingEntry.id);
              if (res && (res.status === 200 || res.status === 204)) {
                Alert.alert('Usunięto', 'Wpis tankowania został usunięty.');
                onRefuelAdded({ id: existingEntry.id, _deleted: true });
                return;
              } else if (res && res.status === 404) {
                Alert.alert('Błąd', 'Wpis nie istniał. Odświeżam listę.');
                onRefuelAdded();
                return;
              }
              Alert.alert('Błąd', 'Nie udało się usunąć wpisu.');
              onRefuelAdded();
            } catch (e: any) {
              console.error('Błąd usuwania tankowania', e);
              Alert.alert('Błąd', e?.response?.data || e?.message || 'Nieznany błąd');
            } finally {
              setLoading(false);
            }
        } }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{existingEntry ? 'Edytuj tankowanie' : 'Dodaj tankowanie'}</Text>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.labelSmall}>Stan licznika</Text>
          <TextInput style={styles.input} placeholder="km" keyboardType="numeric" value={odometer} onChangeText={setOdometer} />
        </View>
        <View style={[styles.col, { marginLeft: 10 }]}>
          <Text style={styles.labelSmall}>Ilość (L)</Text>
          <TextInput style={styles.input} placeholder="litry" keyboardType="numeric" value={liters} onChangeText={setLiters} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.labelSmall}>Cena/l (PLN)</Text>
          <TextInput style={styles.input} placeholder="PLN" keyboardType="numeric" value={pricePerLiter} onChangeText={setPricePerLiter} />
        </View>
        <View style={[styles.col, { marginLeft: 10 }]}>
          <Text style={styles.labelSmall}>Całkowity koszt</Text>
          <TextInput style={[styles.input, { backgroundColor: '#f4f6f8' }]} placeholder="" value={totalCost} editable={false} />
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={styles.labelSmall}>Data tankowania</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateBtnText}>{date.toDateString()}</Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker value={date} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={handleDateChange} />
      )}

      <View style={{ marginTop: 16 }}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={loading}>
          <Text style={styles.primaryBtnText}>{loading ? (existingEntry ? 'Zapisywanie...' : 'Dodawanie...') : (existingEntry ? 'Zapisz zmiany' : 'Dodaj tankowanie')}</Text>
        </TouchableOpacity>

        {existingEntry && (
          <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={loading}>
              <Text style={styles.deleteBtnText}>Usuń wpis</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => { if (onCancel) { try { onCancel(); } catch (e) {} try { onRefuelAdded(); } catch (e) {} } else onRefuelAdded(); }}>
              <Text style={styles.ghostBtnText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        )}

        {!existingEntry && (
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => { if (onCancel) { try { onCancel(); } catch (e) {} try { onRefuelAdded(); } catch (e) {} } else onRefuelAdded(); }}>
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

  row: { flexDirection: 'row', marginTop: 6 },
  col: { flex: 1 },
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