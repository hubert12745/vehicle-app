import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, ActivityIndicator } from "react-native";
import api from "../api";

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
}

export default function ServiceEntriesScreen({ vehicleId, onBack }: ServiceEntriesScreenProps) {
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