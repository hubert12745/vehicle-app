import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button } from "react-native";
import api from "../api";
import AddVehicleScreen from "./AddVehicle";
import RefuelScreen from "./Refuel";


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
  const [error, setError] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showRefuel, setShowRefuel] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const loadVehicles = async () => {
    try {
      const res = await api.get<Vehicle[]>("/vehicles/");
      if (res.status === 200) {
        console.log("📦 Vehicles:", res.data);
        setVehicles(res.data); // Set the vehicles state
        setError(null); // Clear any previous error
      } else {
        // Handle unexpected non-200 responses
        console.error("Unexpected response:", res);
        setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
      }
    } catch (err: any) {
      // Handle network or token-related errors
      console.error("❌ API error:", err.response?.data || err.message);
      setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
    }
  };

  useEffect(() => {
    loadVehicles();
  }, [token]);

  // 🔄 widok formularza dodawania pojazdu
  if (showAddVehicle) {
    return (
      <AddVehicleScreen
        onVehicleAdded={() => {
          setShowAddVehicle(false);
          loadVehicles();
        }}
      />
    );
  }

  if (showRefuel && selectedVehicleId) {
    return (
      <RefuelScreen
        vehicleId={selectedVehicleId}
        onRefuelAdded={() => {
          setShowRefuel(false);
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
          <View style={styles.vehicleItem}>
            <Text style={styles.item}>
              {item.make} {item.model} ({item.registration || "brak rejestracji"})
            </Text>
            <Button
              title="➕ Dodaj tankowanie"
              onPress={() => {
                setSelectedVehicleId(item.id);
                setShowRefuel(true);
              }}
            />
          </View>
        )}
      />

      <View style={{ marginTop: 25 }}>
        <Button title="➕ Dodaj pojazd" onPress={() => setShowAddVehicle(true)} />
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
  vehicleItem: { marginBottom: 15, alignItems: "center" },
  item: { fontSize: 18, marginBottom: 5 },
  error: { color: "red", marginBottom: 10 },
});