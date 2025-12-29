import React, { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, Alert, TouchableOpacity, StyleSheet, Switch } from "react-native";
import api, { deleteService } from "../api";
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface ServiceEntry {
  id: number;
  title: string;
  description: string;
  cost: number;
  date: string;
}

interface ServiceEntriesScreenProps {
  vehicleId: number;
  onBack: () => void; // Callback to navigate back to the vehicle list
  onEditEntry?: (entry: ServiceEntry) => void;
  onViewEntry?: (entry: ServiceEntry) => void;
  patch?: ServiceEntry | null; // optional one-time patch object to merge into list after load
  clearPatch?: () => void; // callback to clear patch in parent
}

export default function ServiceEntriesScreen({ vehicleId, onBack, onEditEntry, onViewEntry, patch = null, clearPatch }: ServiceEntriesScreenProps & { onViewEntry?: (entry: any) => void }) {
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServiceEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<ServiceEntry[]>(`/service/vehicle/${vehicleId}`);
      if (res.status === 200) {
        setServiceEntries(res.data);
        setError(null);
      } else {
        setError("Nie udało się pobrać danych serwisowych.");
      }
    } catch (err: any) {
      console.error("❌ Błąd pobierania serwisów:", err.response?.data || err.message);
      setError("Nie udało się pobrać danych serwisowych. Sprawdź połączenie.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServiceEntries();
  }, []);

  // If parent supplies a one-time patch (new or updated entry), merge it after load
  useEffect(() => {
    if (!loading && patch) {
      setServiceEntries((prev) => {
        const idx = prev.findIndex((p) => p.id === patch.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = patch;
          return copy;
        }
        return [patch, ...prev];
      });
      if (clearPatch) clearPatch();
    }
  }, [patch, loading]);

  const toggleDone = async (item: any) => {
    try {
      const payload = { id: item.id, vehicle_id: vehicleId, done: !item.done };
      const res = await api.post('/service/upsert', payload);
      if (res && (res.status === 200 || res.status === 201)) {
        // update local list
        setServiceEntries((prev) => prev.map((p) => p.id === item.id ? { ...p, done: !p.done } : p));
      }
    } catch (e: any) {
      console.error('Toggle done failed', e);
      Alert.alert('Błąd', 'Nie udało się zaktualizować statusu.');
    }
  };

  return (
    <View style={theme.page}>
      <View style={[theme.card, { paddingBottom: 8, flex: 1 }]}>
        <Text style={styles.title}>🛠️ Historia serwisów</Text>

        {loading && <ActivityIndicator size="large" color={theme.primary || '#2e86de'} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && serviceEntries.length === 0 && (
          <Text style={{ textAlign: 'center', marginTop: 20 }}>Brak danych serwisowych dla tego pojazdu.</Text>
        )}

        {!loading && !error && (
          <FlatList
            style={{ marginTop: 8, flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            data={serviceEntries}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.9} onPress={() => onViewEntry && onViewEntry(item)}>
                <View style={styles.card}>
                  <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString()}</Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDesc}>{item.description}</Text>
                  <Text style={styles.cardCost}>Koszt: {item.cost.toFixed(2)} PLN</Text>
                  <Text style={{ marginTop: 6, color: '#7f8c8d' }}>{item.next_due_date ? `Następny: ${new Date(item.next_due_date).toLocaleDateString()}` : (item.next_due_odometer ? `Następny przebieg: ${item.next_due_odometer} km` : '')}</Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: item.done ? '#16a085' : '#e67e22', fontWeight: '700' }}>{item.done ? 'Zrobione' : 'Do zrobienia'}</Text>
                    <TouchableOpacity style={[theme.ghostBtn, { marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10 }]} onPress={() => toggleDone(item)}>
                      <Text style={[theme.ghostBtnText]}>{item.done ? 'Oznacz jako nie zrobione' : 'Oznacz jako zrobione'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        <View style={{ marginTop: 20 }}>
          <TouchableOpacity style={[theme.ghostBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={onBack}>
            <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
            <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Powrót</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
 }

const styles = StyleSheet.create({
   title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12, color: '#2c3e50' },
   error: { color: 'red', textAlign: 'center', marginBottom: 10 },

   card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
   cardDate: { color: '#7f8c8d', fontSize: 12 },
   cardTitle: { fontSize: 16, fontWeight: '700', color: '#34495e', marginTop: 6 },
   cardDesc: { color: '#7f8c8d', marginTop: 6 },
   cardCost: { color: '#2c3e50', fontWeight: '700', marginTop: 8 },
});