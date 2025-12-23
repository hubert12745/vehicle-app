import React, { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import api from "../api";
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

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

export default function FuelEntriesScreen({ vehicleId, onBack, onEditEntry, onViewEntry, patch = null, clearPatch }: FuelEntriesScreenProps & { onViewEntry?: (entry: FuelEntry) => void }) {
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
    <View style={theme.page}>
      <Text style={theme.headerTitle}>⛽ Historia tankowań</Text>
      {loading && <ActivityIndicator size="large" color={theme.primary || '#2e86de'} />}
      {error && <Text style={[theme.headerSubtitle, { color: 'red' }]}>{error}</Text>}

      <View style={{ marginTop: 8 }}>
        {/* Prediction and anomaly summary */}
        {!loading && !error && (
          <View style={{ marginBottom: 12 }}>
            {predictedConsumption != null && (
              <View style={[theme.card, { backgroundColor: '#eef6ff', marginBottom: 8 }]}>
                <Text style={styles.summaryTitle}>Przewidywane spalanie: {predictedConsumption} L/100km</Text>
                {kmUntilRefuel != null && <Text style={styles.summaryText}>Szacowany zasięg: ~{kmUntilRefuel} km</Text>}
                {daysUntilRefuel != null && <Text style={styles.summaryText}>~{daysUntilRefuel} dni</Text>}
              </View>
            )}

            {anomalies.length > 0 && (
              <View style={[theme.card, anomalies.some(a => a.severity === 'severe') ? { backgroundColor: '#fdecea' } : { marginTop: 6 } ]}>
                <Text style={[styles.summaryTitle, anomalies.some(a => a.severity === 'severe') ? { color: '#7a1f1f' } : {}]}>Wykryto anomalie ({anomalies.length})</Text>
                {anomalies.slice(0,3).map(a => (
                  <Text key={a.id} style={[styles.summaryText, a.severity === 'severe' ? { color: '#7a1f1f' } : {}]}>• Wpis #{a.id}: {a.value} L/100km</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {!loading && !error && fuelEntries.length === 0 && (
          <Text style={{ textAlign: "center", marginTop: 20 }}>Brak danych tankowań dla tego pojazdu.</Text>
        )}

        {!loading && !error && (
          <FlatList
            style={{ marginTop: 8 }}
            data={fuelEntries}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
               const consumption = consumptionMap[item.id];
               const isAnom = anomalies.some(a => a.id === item.id);
               return (
                 <TouchableOpacity activeOpacity={0.9} onPress={() => onViewEntry && onViewEntry(item)}>
                   <View style={[theme.card, styles.card, isAnom ? { borderColor: '#8e44ad', borderWidth: 2 } : {}]}>
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                     <View style={{ flex: 1 }}>
                       <Text style={styles.cardTitle}>{new Date(item.date).toLocaleDateString()}</Text>
                       <Text style={styles.cardSubtitle}>Stan licznika: {item.odometer} km</Text>
                       <Text style={styles.smallText}>Ilość: {item.liters} L • Cena/l: {item.price_per_liter.toFixed(2)} PLN</Text>
                     </View>

                     <View style={{ alignItems: 'flex-end' }}>
                       <View style={[styles.pill, { backgroundColor: consumptionColor(consumption, isAnom) }]}>
                         <Text style={styles.pillText}>{consumption != null ? `${consumption} L/100km` : '—'}</Text>
                       </View>

                       <View style={{ height: 10 }} />

                       <TouchableOpacity style={[theme.primaryBtn, { paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }]} onPress={() => onEditEntry && onEditEntry(item)}>
                         <Ionicons name="create-outline" size={14} color="#fff" />
                         <Text style={[theme.primaryBtnText, { marginLeft: 8 }]}>Edytuj</Text>
                       </TouchableOpacity>
                     </View>
                   </View>
                 </View>
                 </TouchableOpacity>
               );
             }}
           />
         )}
      </View>

      <View style={{ marginTop: 20 }}>
        <TouchableOpacity style={[theme.ghostBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
          <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Powrót</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12, color: '#2c3e50' },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },

  summaryCard: { padding: 12, backgroundColor: '#eef6ff', borderRadius: 10, marginBottom: 10 },
  summaryTitle: { fontWeight: '700', color: '#2c3e50' },
  summaryText: { color: '#2c3e50', marginTop: 4 },

  card: { padding: 12, borderRadius: 10, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#34495e' },
  cardSubtitle: { color: '#7f8c8d', marginTop: 4 },
  smallText: { color: '#95a5a6', marginTop: 8 },

  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16 },
  pillText: { color: '#fff', fontWeight: '700' },
});
