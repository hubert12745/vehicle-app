import React, { useEffect, useState } from 'react';
import { View, Text, Button, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import api from '../api';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Simple Reports screen: choose vehicle, month/year, fetch JSON report and CSV
export default function Reports({ navigation }) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const res = await api.get('/vehicles/');
      if (res.status === 200) {
        setVehicles(res.data || []);
        if ((res.data || []).length > 0) setVehicleId(res.data[0].id);
      } else {
        Alert.alert('Błąd', 'Nie można załadować pojazdów');
      }
    } catch (e) {
      console.warn(e);
      Alert.alert('Błąd', 'Nie można załadować pojazdów');
    }
  };

  const fetchReport = async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const res = await api.get('/reports/monthly', { params: { vehicle_id: vehicleId, year, month } });
      if (res.status === 200) setReport(res.data);
      else throw new Error('Report error');
    } catch (e) {
      console.warn(e);
      Alert.alert('Błąd', 'Nie udało się pobrać raportu');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (!vehicleId) return;
    try {
      // Request CSV as text
      const res = await api.get('/reports/monthly/csv', { params: { vehicle_id: vehicleId, year, month }, responseType: 'text' });
      if (res.status !== 200) throw new Error('CSV failed');
      const text = res.data as string;

      const filename = `report_vehicle_${vehicleId}_${year}_${String(month).padStart(2, '0')}.csv`;

      // Android: attempt to save directly to user-chosen directory (Storage Access Framework)
      if (Platform.OS === 'android') {
        try {
          // Ask user to pick a directory (they can choose Downloads)
          const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Anulowano', 'Nie przyznano uprawnień do zapisu.');
            return;
          }
          const dirUri = perm.directoryUri;
          // create file in selected directory
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, filename, 'text/csv');
          // write content to the created file (SAF supports content URIs)
          await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
          Alert.alert('Zapisano', 'Plik został zapisany w wybranym folderze.');
          return;
        } catch (e) {
          console.warn('SAF save failed, falling back to share', e);
          // fallthrough to fallback behavior
        }
      }

      // default fallback: write to app documentDirectory and open share/save dialog
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        // likely running on web or unsupported environment — show preview
        const preview = text.split('\n').slice(0, 20).join('\n');
        Alert.alert('CSV (podgląd)', preview, [{ text: 'OK' }]);
        return;
      }
      const fileUri = docDir + filename;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });

      // if we can write file and platform supports direct saving, just notify; else open share
      if (Platform.OS === 'android') {
        // On Android, sharing may show save options; try to open sharing as fallback
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
        } else {
          Alert.alert('Gotowe', `Plik zapisano: ${fileUri}`);
        }
      } else {
        // iOS and others: open share if available
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
        } else {
          Alert.alert('Gotowe', `Plik zapisano: ${fileUri}`);
        }
      }

    } catch (e) {
      console.warn(e);
      Alert.alert('Błąd', 'Nie udało się pobrać lub zapisać CSV');
    }
  };

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Raport miesięczny</Text>

      <Text>Pojazd:</Text>
      {vehicles.length === 0 ? (
        <Text>Brak pojazdów</Text>
      ) : (
        <Picker selectedValue={vehicleId} onValueChange={(v) => setVehicleId(Number(v))}>
          {vehicles.map((v) => (
            <Picker.Item key={v.id} label={`${v.make} ${v.model} (${v.registration || ''})`} value={v.id} />
          ))}
        </Picker>
      )}

      <Text>Rok:</Text>
      <Picker selectedValue={year} onValueChange={(v) => setYear(Number(v))}>
        {Array.from({ length: 6 }).map((_, i) => {
          const y = new Date().getFullYear() - 2 + i;
          return <Picker.Item key={y} label={`${y}`} value={y} />;
        })}
      </Picker>

      <Text>Miesiąc:</Text>
      <Picker selectedValue={month} onValueChange={(v) => setMonth(Number(v))}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Picker.Item key={i + 1} label={`${i + 1}`} value={i + 1} />
        ))}
      </Picker>

      <View style={{ marginVertical: 8 }}>
        <Button title="Pobierz raport" onPress={fetchReport} />
      </View>

      {loading && <ActivityIndicator />}

      {report && (
        <View>
          <Text style={{ marginTop: 12, fontWeight: 'bold' }}>Podsumowanie</Text>
          <Text>Łączny koszt: {report.total_cost} PLN</Text>
          <Text>Łącznie litrów: {report.total_liters} L</Text>
          <Text>Przebyta odległość: {report.distance} km</Text>
          <Text>Średnie spalanie: {report.avg_consumption ?? '—'} l/100km</Text>

          <Text style={{ marginTop: 12, fontWeight: 'bold' }}>Wpisy tankowań:</Text>
          {report.entries && report.entries.length > 0 ? (
            report.entries.map((e: any) => (
              <View key={e.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                <Text>{e.date.slice(0, 10)} — {e.odometer} km — {e.liters} L — {e.total_cost} PLN</Text>
                {e.notes ? <Text style={{ color: '#666' }}>{e.notes}</Text> : null}
              </View>
            ))
          ) : (
            <Text>Brak wpisów w tym miesiącu</Text>
          )}

          <View style={{ marginVertical: 8 }}>
            <Button title="Eksportuj CSV" onPress={exportCsv} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}
