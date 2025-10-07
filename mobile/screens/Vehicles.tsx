import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button } from "react-native";
import api from "../api";
import AddVehicleScreen from "./AddVehicle";

interface Vehicle {
  id: number;
  make: string;
  model: string;
  registration?: string;
}

export default function VehiclesScreen({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [consumption, setConsumption] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false); // ✅ brakujący state

  const loadVehicles = async () => {
    try {
      const res = await api.get<Vehicle[]>("/vehicles/");
      console.log("📦 Vehicles:", res.data);
      setVehicles(res.data);

      if (res.data.length > 0) {
        const firstId = res.data[0].id;
        const cons = await api.get(`/vehicles/${firstId}/consumption`);
        setConsumption(cons.data.avg_consumption + " l/100km");
      }
      setError(null);
    } catch (err: any) {
      console.error("❌ API error:", err.response?.data || err.message);
      setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
    }
  };

  useEffect(() => {
    loadVehicles();
  }, [token]);

  // 🔄 widok formularza dodawania pojazdu
  if (showAdd) {
    return (
      <AddVehicleScreen
        onVehicleAdded={() => {
          setShowAdd(false);
          loadVehicles();
        }}
      />
    );
  }

  // 🔄 widok listy pojazdów
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚗 Moje pojazdy</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Text style={styles.item}>
            {item.make} {item.model} ({item.registration || "brak rejestracji"})
          </Text>
        )}
      />

      {consumption ? (
        <Text style={styles.consumption}>Średnie spalanie: {consumption}</Text>
      ) : null}

      <View style={{ marginTop: 25 }}>
        <Button title="➕ Dodaj pojazd" onPress={() => setShowAdd(true)} />
        <View style={{ height: 10 }} />
        <Button title="🔄 Odśwież" onPress={loadVehicles} />
        <View style={{ height: 10 }} />
        <Button title="🔒 Wyloguj się" onPress={onLogout} color="red" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  item: { fontSize: 18, marginBottom: 10 },
  consumption: { marginTop: 20, fontSize: 18, color: "green" },
  error: { color: "red", marginBottom: 10 },
});
