import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Platform, TouchableOpacity, LayoutAnimation } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import api, { deleteFuel, uploadFuelWithReceipt } from "../api";
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

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
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptLocalName, setReceiptLocalName] = useState<string | null>(null);

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
            if (receiptUri) {
              // prepare FormData
              const form = new FormData();
              form.append('vehicle_id', String(vehicleId));
              form.append('odometer', String(payload.odometer));
              form.append('liters', String(payload.liters));
              form.append('price_per_liter', String(payload.price_per_liter));
              form.append('total_cost', String(payload.total_cost));
              form.append('date', String(payload.date));
              if (payload.total_cost) form.append('total_cost', String(payload.total_cost));
              if (payload.date) form.append('date', String(payload.date));
              if (payload.notes) form.append('notes', String(payload.notes));

              // On Expo, file needs to be { uri, name, type }
              const uriParts = receiptUri.split('.');
              const fileExt = uriParts[uriParts.length - 1];
              const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
              form.append('receipt', {
                uri: receiptUri,
                name: receiptLocalName || `receipt.${fileExt}`,
                type: mimeType,
              } as any);

              res = await uploadFuelWithReceipt(form);
            } else {
              res = await api.post("/fuel/", payload);
            }
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
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
          setReceiptUri(null);
          setReceiptLocalName(null);
          // If server returned created/updated object, pass it as patch so UI can update immediately
          const returned = res?.data;
          if (returned) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            onRefuelAdded(returned);
            return;
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                onRefuelAdded({ id: existingEntry.id, _deleted: true });
                return;
              } else if (res && res.status === 404) {
                Alert.alert('Błąd', 'Wpis nie istniał. Odświeżam listę.');
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const pickImage = async () => {
    try {
      // Request permission (works on native). For web this will be a no-op.
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[Refuel] ImagePicker permission:', permission);
      if (!permission.granted) {
        Alert.alert('Brak uprawnień', 'Aplikacja potrzebuje dostępu do zdjęć, aby dodać paragon.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: false });
      console.log('[Refuel] ImagePicker result:', result);

      // Handle both legacy and new response shapes
      // New: { canceled: boolean, assets: [{ uri, ... }] }
      // Old: { cancelled: boolean, uri: 'file://...' }
      let uri: string | undefined | null = null;
      if ((result as any).canceled === false && Array.isArray((result as any).assets) && (result as any).assets.length > 0) {
        uri = (result as any).assets[0].uri;
      } else if ((result as any).cancelled === false && (result as any).uri) {
        uri = (result as any).uri;
      } else if ((result as any).uri) {
        // fallback if API returned uri directly
        uri = (result as any).uri;
      }

      if (!uri) {
        // User cancelled or no uri found
        console.log('[Refuel] No image selected or uri missing');
        return; // do nothing, treating as user-cancel
      }

      setReceiptUri(uri);
      // try to extract filename
      const parts = uri.split('/');
      setReceiptLocalName(parts[parts.length - 1]);
    } catch (e) {
      console.warn('Image pick failed', e);
      // provide more helpful error message
      Alert.alert('Błąd', 'Nie udało się wybrać zdjęcia — sprawdź uprawnienia aplikacji i spróbuj ponownie.');
    }
  };

  return (
    <View style={theme.page}>
      <Text style={theme.headerTitle}>{existingEntry ? 'Edytuj tankowanie' : 'Dodaj tankowanie'}</Text>
      <View style={[theme.card, { marginTop: 8 }]}>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.labelSmall}>Stan licznika</Text>
            <TextInput style={theme.input} placeholder="km" keyboardType="numeric" value={odometer} onChangeText={setOdometer} />
          </View>
          <View style={[styles.col, { marginLeft: 10 }]}>
            <Text style={styles.labelSmall}>Ilość (L)</Text>
            <TextInput style={theme.input} placeholder="litry" keyboardType="numeric" value={liters} onChangeText={setLiters} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.labelSmall}>Cena/l (PLN)</Text>
            <TextInput style={theme.input} placeholder="PLN" keyboardType="numeric" value={pricePerLiter} onChangeText={setPricePerLiter} />
          </View>
          <View style={[styles.col, { marginLeft: 10 }]}>
            <Text style={styles.labelSmall}>Całkowity koszt</Text>
            <TextInput style={[theme.input, { backgroundColor: '#f4f6f8' }]} placeholder="" value={totalCost} editable={false} />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={styles.labelSmall}>Data tankowania</Text>
          <TouchableOpacity style={theme.ghostBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={theme.ghostBtnText}>{date.toDateString()}</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker value={date} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={handleDateChange} />
        )}

        <View style={{ marginTop: 12 }}>
          <Text style={styles.labelSmall}>Paragon (opcjonalnie)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity style={[theme.ghostBtn, { paddingVertical: 8, paddingHorizontal: 12 }]} onPress={pickImage}>
              <Ionicons name="image-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
              <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>{receiptUri ? 'Zmień zdjęcie' : 'Wybierz zdjęcie'}</Text>
            </TouchableOpacity>
            {receiptUri ? (
              <Image source={{ uri: receiptUri }} style={{ width: 64, height: 48, marginLeft: 12, borderRadius: 6 }} />
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity style={theme.primaryBtn} onPress={async () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); await handleSave(); }} disabled={loading}>
            <Text style={theme.primaryBtnText}>{loading ? (existingEntry ? 'Zapisywanie...' : 'Dodawanie...') : (existingEntry ? 'Zapisz zmiany' : 'Dodaj tankowanie')}</Text>
          </TouchableOpacity>

          {existingEntry && (
            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity style={[theme.ghostBtn, { flex: 1, borderColor: '#e74c3c', borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', marginRight: 8 }]} onPress={async () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); await handleDelete(); }} disabled={loading}>
                <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                <Text style={[theme.ghostBtnText, { marginLeft: 8, color: '#e74c3c', flexShrink: 1, textAlign: 'center' }]}>Usuń</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[theme.ghostBtn, { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', marginLeft: 8 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); if (onCancel) { try { onCancel(); } catch (e) {} try { onRefuelAdded(); } catch (e) {} } else onRefuelAdded(); }}>
                <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
                <Text style={[theme.ghostBtnText, { marginLeft: 8, flexShrink: 1, textAlign: 'center' }]}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          )}

          {!existingEntry && (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={[theme.ghostBtn, { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); if (onCancel) { try { onCancel(); } catch (e) {} try { onRefuelAdded(); } catch (e) {} } else onRefuelAdded(); }}>
                <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
                <Text style={[theme.ghostBtnText, { marginLeft: 8, flexShrink: 1 }]}>Wróć</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: '#2c3e50', textAlign: 'center', marginBottom: 12 },

  row: { flexDirection: 'row', marginTop: 6 },
  col: { flex: 1 },
  labelSmall: { color: '#7f8c8d', marginBottom: 6 },
});