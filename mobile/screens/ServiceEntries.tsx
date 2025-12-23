import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, ActivityIndicator, Alert } from "react-native";
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

      {loading && <ActivityIndicator size="large" color="#0000ff" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && serviceEntries.length === 0 && (
        <Text style={{ textAlign: "center", marginTop: 20 }}>
          Brak danych serwisowych dla tego pojazdu.
        </Text>
      )}

      {!loading && !error && (
        <FlatList
          data={serviceEntries}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <Text>Data: {new Date(item.date).toLocaleDateString()}</Text>
              <Text>Tytuł: {item.title}</Text>
              <Text>Opis: {item.description}</Text>
              <Text>Koszt: {item.cost.toFixed(2)} PLN</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                {onEditEntry && <Button title="Edytuj" onPress={() => onEditEntry(item)} />}
                <Button
                  title="Usuń"
                  color="red"
                  onPress={() => {
                    Alert.alert(
                      'Usuń wpis',
                      'Czy na pewno chcesz usunąć ten wpis serwisowy?',
                      [
                        { text: 'Anuluj', style: 'cancel' },
                        { text: 'Usuń', style: 'destructive', onPress: async () => {
                            try {
                              const res = await deleteService(item.id);
                              // If deletion succeeded (204) remove from local list immediately
                              if (res && (res.status === 200 || res.status === 204)) {
                                setServiceEntries((prev) => prev.filter((p) => p.id !== item.id));
                                Alert.alert('Usunięto', 'Wpis został usunięty.');
                              } else if (res && res.status === 404) {
                                const body = res.data || {};
                                const msg = body?.detail || 'Wpis nie istnieje na serwerze.';
                                Alert.alert('Błąd', msg + '\nLista istniejących wpisów zostanie odświeżona.');
                                loadServiceEntries();
                              } else {
                                // Unexpected but handle gracefully
                                Alert.alert('Błąd', 'Nie udało się usunąć wpisu. Spróbuj ponownie.');
                                loadServiceEntries();
                              }
                            } catch (e: any) {
                              console.error('Błąd usuwania serwisu', e);
                              Alert.alert('Błąd', e?.response?.data || e?.message || 'Nieznany błąd');
                            }
                        } }
                      ]
                    );
                  }}
                />
              </View>
            </View>
          )}
        />
      )}

      <View style={{ marginTop: 20 }}>
        <Button title="⬅️ Powrót" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  entry: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  error: { color: "red", textAlign: "center", marginBottom: 10 },
});