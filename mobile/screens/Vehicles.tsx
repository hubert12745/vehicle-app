import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import api from "../api";

interface Vehicle {
  id: number;
  make: string;
  model: string;
  registration?: string;
}

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [consumption, setConsumption] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // pobierz wszystkie pojazdy
        const res = await api.get<Vehicle[]>("/vehicles/");
        setVehicles(res.data);

        // policz spalanie pierwszego pojazdu
        if (res.data.length > 0) {
          const firstId = res.data[0].id;
          const cons = await api.get(`/vehicles/${firstId}/consumption`);
          setConsumption(cons.data.avg_consumption + " l/100km");
        }
      } catch (err) {
        console.error("API error", err);
      }
    };

    fetchData();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚗 Moje pojazdy</Text>

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Text style={styles.item}>
            {item.make} {item.model} ({item.registration || "brak rejestracji"})
          </Text>
        )}
      />

      {consumption && (
        <Text style={styles.consumption}>Średnie spalanie: {consumption}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  item: { fontSize: 18, marginBottom: 10 },
  consumption: { marginTop: 20, fontSize: 18, color: "green" },
});
