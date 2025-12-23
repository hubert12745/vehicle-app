import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import api from "../api";
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onVehicleAdded: () => void;
}

export default function AddVehicleScreen({ onVehicleAdded }: Props) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registration, setRegistration] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddVehicle = async () => {
    if (!make || !model) {
      Alert.alert("Błąd", "Podaj co najmniej markę i model.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/vehicles/", {
        make,
        model,
        year: year ? parseInt(year) : null,
        registration: registration || null,
      });

      Alert.alert("Sukces", "Pojazd został dodany!");
      setMake("");
      setModel("");
      setYear("");
      setRegistration("");
      onVehicleAdded(); // wróć do listy i odśwież
    } catch (err: any) {
      console.error("❌ Błąd dodawania pojazdu:", err.response?.data || err.message);
      Alert.alert("Błąd", "Nie udało się dodać pojazdu. Sprawdź połączenie lub token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={theme.page}>
      <View style={[theme.card, { marginTop: 24 }]}>
        <Text style={theme.headerTitle}>➕ Dodaj pojazd</Text>

        <TextInput style={theme.input} placeholder="Marka (np. Toyota)" value={make} onChangeText={setMake} />
        <TextInput style={theme.input} placeholder="Model (np. Corolla)" value={model} onChangeText={setModel} />
        <TextInput style={theme.input} placeholder="Rok produkcji" keyboardType="numeric" value={year} onChangeText={setYear} />
        <TextInput style={theme.input} placeholder="Numer rejestracyjny" value={registration} onChangeText={setRegistration} />

        <TouchableOpacity style={[theme.primaryBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleAddVehicle} disabled={loading}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={[theme.primaryBtnText, { marginLeft: 8 }]}>{loading ? 'Dodawanie...' : 'Dodaj pojazd'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[theme.ghostBtn, { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={onVehicleAdded}>
          <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
          <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Powrót</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
