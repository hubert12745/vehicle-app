import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, ActivityIndicator, ScrollView } from "react-native";
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

interface Anomaly {
  id: number;
  value: number;
  baseline: number;
  percentDiff: number;
  severity: 'mild' | 'moderate' | 'severe';
}

export default function FuelEntriesScreen({ vehicleId, onBack, onEditEntry, patch = null, clearPatch }: FuelEntriesScreenProps) {
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [consumptionMap, setConsumptionMap] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prediction / anomaly state
  const [predictedConsumption, setPredictedConsumption] = useState<number | null>(null);
  const [kmUntilRefuel, setKmUntilRefuel] = useState<number | null>(null);
  const [daysUntilRefuel, setDaysUntilRefuel] = useState<number | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

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

  const computePredictionsAndAnomalies = (entries: FuelEntry[], cmap: Record<number, number | null>) => {
    // We use the most recent consumption values to predict next consumption.
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // collect consumption values in chronological order aligned with sorted
    const consumptions: Array<{ id: number; value: number } > = [];
    for (let i = 1; i < sorted.length; i++) {
      const c = cmap[sorted[i].id];
      if (typeof c === 'number' && isFinite(c) && c > 0) consumptions.push({ id: sorted[i].id, value: c });
    }

    // Predict consumption as average of last up to 3 values (most recent)
    let predicted: number | null = null;
    if (consumptions.length >= 1) {
      const lastN = consumptions.slice(-3).map((c) => c.value);
      const sum = lastN.reduce((s, v) => s + v, 0);
      predicted = Number((sum / lastN.length).toFixed(2));
    }

    // Estimate km until next refuel using the latest entry's liters and predicted consumption
    let kmNext: number | null = null;
    let daysNext: number | null = null;
    if (predicted && sorted.length >= 1) {
      // Use estimated tank capacity as the largest 'liters' value seen in entries
      const tankCapacity = sorted.reduce((m, e) => {
        const v = Number(e.liters) || 0;
        return Math.max(m, v);
      }, 0);
      if (tankCapacity > 0 && predicted > 0) {
        kmNext = Number(((tankCapacity / predicted) * 100).toFixed(0));
      }

      // estimate avg daily km using the last up to 5 entries
      if (sorted.length >= 2) {
        const sample = sorted.slice(-5);
        const firstSample = sample[0];
        const lastSample = sample[sample.length - 1];
        const days = Math.max(1, (new Date(lastSample.date).getTime() - new Date(firstSample.date).getTime()) / (1000 * 60 * 60 * 24));
        const distance = lastSample.odometer - firstSample.odometer;
        const avgDailyKm = days > 0 ? distance / days : 0;
        if (avgDailyKm > 0 && kmNext != null) {
          daysNext = Number((kmNext / avgDailyKm).toFixed(1));
        }
      }
    }

    // Detect anomalies: compare each consumption value to rolling baseline (previous up to 3 values)
    const found: Anomaly[] = [];
    for (let i = 0; i < consumptions.length; i++) {
      const curr = consumptions[i];
      const prevWindow = consumptions.slice(Math.max(0, i - 3), i).map((c) => c.value);
      if (prevWindow.length === 0) continue; // can't determine anomaly without history
      const baseline = prevWindow.reduce((s, v) => s + v, 0) / prevWindow.length;
      if (!baseline || baseline <= 0) continue;
      const diff = curr.value - baseline;
      const percent = Math.abs(diff / baseline);
      let severity: Anomaly['severity'] | null = null;
      if (percent >= 0.8) severity = 'severe';
      else if (percent >= 0.5) severity = 'moderate';
      else if (percent >= 0.25) severity = 'mild';
      if (severity) {
        found.push({ id: curr.id, value: curr.value, baseline: Number(baseline.toFixed(2)), percentDiff: Number((percent * 100).toFixed(1)), severity });
      }
    }

    setPredictedConsumption(predicted);
    setKmUntilRefuel(kmNext);
    setDaysUntilRefuel(daysNext);
    setAnomalies(found);
  };

  const loadFuelEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<FuelEntry[]>(`/fuel/vehicle/${vehicleId}`);
      if (res.status === 200) {
        setFuelEntries(res.data);
        const cmap = computeConsumptionMap(res.data);
        setConsumptionMap(cmap);
        computePredictionsAndAnomalies(res.data, cmap);
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
      // Merge patch deterministically and compute consumption/predictions using the merged array
      setFuelEntries((prev) => {
        const base = Array.isArray(prev) ? [...prev] : [];
        const idx = base.findIndex((p) => p.id === patch.id);
        let mergedArr: FuelEntry[];
        if ((patch as any)._deleted) {
          if (idx >= 0) {
            base.splice(idx, 1);
          }
          mergedArr = base;
        } else {
          if (idx >= 0) {
            base[idx] = patch as FuelEntry;
            mergedArr = base;
          } else {
            mergedArr = [patch as FuelEntry, ...base];
          }
        }

        // Recompute consumption map and predictions using the merged result
        try {
          const cmap = computeConsumptionMap(mergedArr);
          // update derived state inside the same tick
          setConsumptionMap(cmap);
          computePredictionsAndAnomalies(mergedArr, cmap);
        } catch (e) {
          console.warn('[FuelEntries] error computing predictions after patch:', e);
        }

        return mergedArr;
      });
       if (clearPatch) clearPatch();
     }
   }, [patch, loading]);

  useEffect(() => {
    // recompute consumption when entries change
    setConsumptionMap(computeConsumptionMap(fuelEntries));
    computePredictionsAndAnomalies(fuelEntries, computeConsumptionMap(fuelEntries));
  }, [fuelEntries]);

  const consumptionColor = (val: number | null, isAnomaly=false) => {
    if (isAnomaly) return '#8e44ad'; // purple for anomaly
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

      {/* Prediction and anomaly summary */}
      {!loading && !error && (
        <View style={{ marginBottom: 12 }}>
          {predictedConsumption != null && (
            <View style={{ padding: 8, backgroundColor: '#eef6ff', borderRadius: 8, marginBottom: 8 }}>
              <Text style={{ fontWeight: '600' }}>Przewidywane spalanie przy następnym tankowaniu: {predictedConsumption} L/100km</Text>
              {kmUntilRefuel != null && <Text>Szacowany zasięg (na zatankowane litry): ~{kmUntilRefuel} km</Text>}
              {daysUntilRefuel != null && <Text>Szacunkowo za: ~{daysUntilRefuel} dni</Text>}
            </View>
          )}

          {anomalies.length > 0 && (
            <View style={{ padding: 10, borderRadius: 8, backgroundColor: anomalies.some(a => a.severity === 'severe') ? '#f8d7da' : '#fff3cd' }}>
              <Text style={{ fontWeight: '700', color: anomalies.some(a => a.severity === 'severe') ? '#721c24' : '#856404' }}>Wykryto anomalie w spalaniu ({anomalies.length})</Text>
              {anomalies.slice(0,3).map(a => (
                <Text key={a.id} style={{ color: anomalies.some(x => x.id === a.id && x.severity === 'severe') ? '#721c24' : '#856404' }}>
                  • Wpis id={a.id}: {a.value} L/100km (śr. {a.baseline} L/100km, różnica {a.percentDiff}%)
                </Text>
              ))}
              {anomalies.length > 3 && <Text>...więcej</Text>}
            </View>
          )}
        </View>
      )}

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
            const isAnom = anomalies.some(a => a.id === item.id);
            return (
              <View style={[styles.entry, isAnom ? { borderColor: '#8e44ad', borderWidth: 2 } : {}]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text>Data: {new Date(item.date).toLocaleDateString()}</Text>
                    <Text>Stan licznika: {item.odometer} km</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: consumptionColor(consumption, isAnom), padding: 6, borderRadius: 6 }}>
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
                  {isAnom && (
                    <Text style={{ color: '#8e44ad', marginTop: 6 }}>
                      ⚠️ Wykryto nietypowe spalanie dla tego wpisu — sprawdź auto lub dane
                    </Text>
                  )}
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