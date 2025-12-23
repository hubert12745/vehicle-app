import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import api, { deleteService } from "../api";

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
  patch?: ServiceEntry | null; // optional one-time patch object to merge into list after load
  clearPatch?: () => void; // callback to clear patch in parent
}

export default function ServiceEntriesScreen({ vehicleId, onBack, onEditEntry, patch = null, clearPatch }: ServiceEntriesScreenProps) {
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛠️ Historia serwisów</Text>

      {loading && <ActivityIndicator size="large" color="#2e86de" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && serviceEntries.length === 0 && (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Brak danych serwisowych dla tego pojazdu.</Text>
      )}

      {!loading && !error && (
        <FlatList
          data={serviceEntries}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString()}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.cardCost}>Koszt: {item.cost.toFixed(2)} PLN</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                {onEditEntry && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => onEditEntry(item)}>
                    <Text style={styles.editBtnText}>Edytuj</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.deleteBtn, { marginLeft: 8 }]} onPress={() => {
                  Alert.alert('Usuń wpis', 'Czy na pewno chcesz usunąć ten wpis serwisowy?', [
                    { text: 'Anuluj', style: 'cancel' },
                    { text: 'Usuń', style: 'destructive', onPress: async () => {
                      try {
                        const res = await deleteService(item.id);
                        if (res && (res.status === 200 || res.status === 204)) {
                          setServiceEntries((prev) => prev.filter((p) => p.id !== item.id));
                          Alert.alert('Usunięto', 'Wpis został usunięty.');
                        } else if (res && res.status === 404) {
                          const body = res.data || {};
                          const msg = body?.detail || 'Wpis nie istnieje na serwerze.';
                          Alert.alert('Błąd', msg + '\nLista istniejących wpisów zostanie odświeżona.');
                          loadServiceEntries();
                        } else {
                          Alert.alert('Błąd', 'Nie udało się usunąć wpisu. Spróbuj ponownie.');
                          loadServiceEntries();
                        }
                      } catch (e: any) {
                        console.error('Błąd usuwania serwisu', e);
                        Alert.alert('Błąd', e?.response?.data || e?.message || 'Nieznany błąd');
                      }
                    } }
                  ]);
                }}>
                  <Text style={styles.deleteBtnText}>Usuń</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <View style={{ marginTop: 20 }}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>⬅️ Powrót</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f8fb' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12, color: '#2c3e50' },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },

  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
  cardDate: { color: '#7f8c8d', fontSize: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#34495e', marginTop: 6 },
  cardDesc: { color: '#7f8c8d', marginTop: 6 },
  cardCost: { color: '#2c3e50', fontWeight: '700', marginTop: 8 },

  editBtn: { backgroundColor: '#2e86de', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  editBtnText: { color: '#fff', fontWeight: '700' },

  deleteBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e74c3c', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  deleteBtnText: { color: '#e74c3c', fontWeight: '700' },

  backBtn: { backgroundColor: '#fff', padding: 12, borderRadius: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6 },
  backBtnText: { fontWeight: '700', color: '#34495e' },
});