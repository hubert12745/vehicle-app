import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button } from "react-native";
import api from "../api";
import AddVehicleScreen from "./AddVehicle";
import RefuelScreen from "./Refuel";
import FuelEntriesScreen from "./FuelEntries";
import AddServiceScreen from "./AddService";
import ServiceEntriesScreen from "./ServiceEntries";

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
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  // State to manage which screen to show
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showRefuel, setShowRefuel] = useState(false);
  const [showFuelEntries, setShowFuelEntries] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showServiceEntries, setShowServiceEntries] = useState(false);

  const loadVehicles = async () => {
    try {
      const res = await api.get<Vehicle[]>("/vehicles/");
      if (res.status === 200) {
        setVehicles(res.data);
        setError(null);
      } else {
        setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
      }
    } catch (err: any) {
      setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
    }
  };

  useEffect(() => {
    loadVehicles();
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚗 Moje pojazdy</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Main Vehicle List */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
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
              <Button
                title="📜 Historia tankowań"
                onPress={() => {
                  setSelectedVehicleId(item.id);
                  setShowFuelEntries(true);
                }}
              />
              <Button
                title="➕ Dodaj serwis"
                onPress={() => {
                  setSelectedVehicleId(item.id);
                  setShowAddService(true);
                }}
              />
              <Button
                title="🛠️ Historia serwisów"
                onPress={() => {
                  setSelectedVehicleId(item.id);
                  setShowServiceEntries(true);
                }}
              />
            </View>
          )}
        />
      )}

      {/* Add Vehicle Screen */}
      {showAddVehicle && (
        <AddVehicleScreen
          onVehicleAdded={() => {
            setShowAddVehicle(false);
            loadVehicles();
          }}
        />
      )}

      {/* Refuel Screen */}
      {showRefuel && selectedVehicleId && (
        <RefuelScreen
          vehicleId={selectedVehicleId}
          onRefuelAdded={() => {
            setShowRefuel(false);
            setSelectedVehicleId(null);
            loadVehicles();
          }}
        />
      )}

      {/* Fuel Entries Screen */}
      {showFuelEntries && selectedVehicleId && (
        <FuelEntriesScreen
          vehicleId={selectedVehicleId}
          onBack={() => {
            setShowFuelEntries(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {/* Add Service Screen */}
      {showAddService && selectedVehicleId && (
        <AddServiceScreen
          vehicleId={selectedVehicleId}
          onServiceAdded={() => {
            setShowAddService(false);
            setSelectedVehicleId(null);
            loadVehicles();
          }}
        />
      )}

      {/* Service Entries Screen */}
      {showServiceEntries && selectedVehicleId && (
        <ServiceEntriesScreen
          vehicleId={selectedVehicleId}
          onBack={() => {
            setShowServiceEntries(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {/* Logout Button */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <View style={{ marginTop: 25 }}>
          <Button title="➕ Dodaj pojazd" onPress={() => setShowAddVehicle(true)} />
          <View style={{ height: 10 }} />
          <Button title="🔄 Odśwież" onPress={loadVehicles} />
          <View style={{ height: 10 }} />
          <Button title="🔒 Wyloguj się" onPress={onLogout} color="red" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  vehicleItem: { marginBottom: 15, alignItems: "center" },
  item: { fontSize: 18, marginBottom: 5 },
  error: { color: "red", marginBottom: 10 },
});