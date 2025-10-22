import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import api from "../api";

interface RefuelScreenProps {
  vehicleId: number;
  onRefuelAdded: () => void; // Callback to refresh data or navigate back
}

export default function RefuelScreen({ vehicleId, onRefuelAdded }: RefuelScreenProps) {
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-calculate total cost when liters or price per liter changes
  useEffect(() => {
    if (liters && pricePerLiter) {
      const calculatedCost = (parseFloat(liters) * parseFloat(pricePerLiter)).toFixed(2);
      setTotalCost(calculatedCost);
    } else {
      setTotalCost("");
    }
  }, [liters, pricePerLiter]);

  const handleAddRefuel = async () => {
    if (!odometer || !liters || !pricePerLiter || !totalCost) {
      Alert.alert("Błąd", "Wypełnij wszystkie pola.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/fuel/", {
        vehicle_id: vehicleId,
        odometer: parseInt(odometer),
        liters: parseFloat(liters),
        price_per_liter: parseFloat(pricePerLiter),
        total_cost: parseFloat(totalCost),
      });

      Alert.alert("Sukces", "Dane tankowania zostały dodane!");
      setOdometer("");
      setLiters("");
      setPricePerLiter("");
      setTotalCost("");
      onRefuelAdded(); // Notify parent to refresh data or navigate back
    } catch (err: any) {
      console.error("❌ Błąd dodawania tankowania:", err.response?.data || err.message);
      Alert.alert("Błąd", "Nie udało się dodać danych tankowania. Sprawdź połączenie lub token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>➕ Dodaj tankowanie</Text>

      <TextInput
        style={styles.input}
        placeholder="Stan licznika (km)"
        keyboardType="numeric"
        value={odometer}
        onChangeText={setOdometer}
      />

      <TextInput
        style={styles.input}
        placeholder="Ilość paliwa (litry)"
        keyboardType="numeric"
        value={liters}
        onChangeText={setLiters}
      />

      <TextInput
        style={styles.input}
        placeholder="Cena za litr (PLN)"
        keyboardType="numeric"
        value={pricePerLiter}
        onChangeText={setPricePerLiter}
      />

      <TextInput
        style={styles.input}
        placeholder="Całkowity koszt (PLN)"
        keyboardType="numeric"
        value={totalCost}
        editable={false} // Make this field read-only since it's auto-calculated
      />

      <Button
        title={loading ? "Dodawanie..." : "Dodaj tankowanie"}
        onPress={handleAddRefuel}
        disabled={loading}
      />

      <View style={{ marginTop: 20 }}>
        <Button title="⬅️ Powrót" onPress={onRefuelAdded} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
});