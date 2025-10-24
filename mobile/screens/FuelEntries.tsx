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
}

export default function FuelEntriesScreen({ vehicleId, onBack }: FuelEntriesScreenProps) {
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFuelEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<FuelEntry[]>(`/fuel/vehicle/${vehicleId}`);
      if (res.status === 200) {
        setFuelEntries(res.data);
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
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <Text>Data: {new Date(item.date).toLocaleDateString()}</Text>
              <Text>Stan licznika: {item.odometer} km</Text>
              <Text>Ilość paliwa: {item.liters} L</Text>
              <Text>Cena za litr: {item.price_per_liter.toFixed(2)} PLN</Text>
              <Text>Całkowity koszt: {item.total_cost.toFixed(2)} PLN</Text>
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