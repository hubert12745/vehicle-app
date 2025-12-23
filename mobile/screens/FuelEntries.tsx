import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, ActivityIndicator } from "react-native";
import api from "../api";

interface FuelEntry {
  id: number;
  odometer: number;
  liters: number;
  price_per_liter: number;
  total_cost: number;
  date: string;
}

interface FuelEntriesScreenProps {
  vehicleId: number;
  onBack: () => void; // Callback to navigate back to the vehicle list
  onEditEntry?: (entry: FuelEntry) => void; // optional callback to edit an entry
  patch?: FuelEntry | null;
  clearPatch?: () => void;
}

export default function FuelEntriesScreen({ vehicleId, onBack, onEditEntry, patch = null, clearPatch }: FuelEntriesScreenProps) {
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [consumptionMap, setConsumptionMap] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeConsumptionMap = (entries: FuelEntry[]) => {
    // Sort chronologically (oldest first) so we can compute distance between consecutive tankings
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const map: Record<number, number | null> = {};
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const distance = curr.odometer - prev.odometer;
      if (!isFinite(distance) || distance <= 0) {
        map[curr.id] = null; // invalid distance -> no consumption
      } else {
        const consumption = (Number(curr.liters) / Number(distance)) * 100; // L per 100km
        map[curr.id] = Number(consumption.toFixed(2));
      }
    }
    // Oldest entry (sorted[0]) intentionally has no consumption value
    return map;
  };

  const loadFuelEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<FuelEntry[]>(`/fuel/vehicle/${vehicleId}`);
      if (res.status === 200) {
        setFuelEntries(res.data);
        setConsumptionMap(computeConsumptionMap(res.data));
        setError(null);
      } else {
        setError("Nie udało się pobrać danych tankowań.");
      }
    } catch (err: any) {
      console.error("❌ Błąd pobierania tankowań:", err.response?.data || err.message);
      setError("Nie udało się pobrać danych tankowań. Sprawdź połączenie.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFuelEntries();
  }, []);

  // apply patch once after load
  useEffect(() => {
    if (!loading && patch) {
      setFuelEntries((prev) => {
        const idx = prev.findIndex((p) => p.id === patch.id);
        if (patch._deleted) {
          return prev.filter((p) => p.id !== patch.id);
        }
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = patch;
          return copy;
        }
        return [patch, ...prev];
      });
      // recompute consumption map
      setConsumptionMap((_) => computeConsumptionMap([...(fuelEntries || []), patch]));
      if (clearPatch) clearPatch();
    }
  }, [patch, loading]);

  useEffect(() => {
    // recompute consumption when entries change
    setConsumptionMap(computeConsumptionMap(fuelEntries));
  }, [fuelEntries]);

  const consumptionColor = (val: number | null) => {
    if (val == null) return '#999';
    if (val <= 6) return '#2ecc71'; // green
    if (val <= 8) return '#f1c40f'; // yellow
    return '#e74c3c'; // red
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⛽ Historia tankowań</Text>

      {loading && <ActivityIndicator size="large" color="#0000ff" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && fuelEntries.length === 0 && (
        <Text style={{ textAlign: "center", marginTop: 20 }}>
          Brak danych tankowań dla tego pojazdu.
        </Text>
      )}

      {!loading && !error && (
        <FlatList
          data={fuelEntries}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const consumption = consumptionMap[item.id];
            return (
              <View style={styles.entry}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text>Data: {new Date(item.date).toLocaleDateString()}</Text>
                    <Text>Stan licznika: {item.odometer} km</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: consumptionColor(consumption), padding: 6, borderRadius: 6 }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{consumption != null ? `${consumption} L/100km` : '—'}</Text>
                    </View>
                    <View style={{ height: 8 }} />
                    {onEditEntry && <Button title="Edytuj" onPress={() => onEditEntry(item)} />}
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text>Ilość paliwa: {item.liters} L</Text>
                  <Text>Cena za litr: {item.price_per_liter.toFixed(2)} PLN</Text>
                  <Text>Całkowity koszt: {item.total_cost.toFixed(2)} PLN</Text>
                </View>
              </View>
            );
          }}
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