import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, BackHandler, Platform } from "react-native";
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

  // selected fuel entry for edit (passed to RefuelScreen)
  const [selectedFuelToEdit, setSelectedFuelToEdit] = useState<any | null>(null);
  const [openedFromEntries, setOpenedFromEntries] = useState(false);

  // selected service entry for edit
  const [selectedServiceToEdit, setSelectedServiceToEdit] = useState<any | null>(null);
  const [openedFromServiceEntries, setOpenedFromServiceEntries] = useState(false);

  // One-time patches from editor screens to merge into list UI without full reload
  const [servicePatch, setServicePatch] = useState<any | null>(null);
  const [fuelPatch, setFuelPatch] = useState<any | null>(null);

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

  useEffect(() => {
    const onHardwareBack = () => {
      // If any editor is open, close it deterministically (mirror onCancel)
      if (showRefuel) {
        setShowRefuel(false);
        if (openedFromEntries) {
          setShowFuelEntries(true);
          setOpenedFromEntries(false);
        } else {
          setSelectedVehicleId(null);
        }
        setSelectedFuelToEdit(null);
        return true; // handled
      }
      if (showAddService) {
        setShowAddService(false);
        if (openedFromServiceEntries) {
          setShowServiceEntries(true);
          setOpenedFromServiceEntries(false);
        } else {
          setSelectedVehicleId(null);
        }
        setSelectedServiceToEdit(null);
        return true;
      }
      if (showFuelEntries) {
        setShowFuelEntries(false);
        setSelectedVehicleId(null);
        setSelectedFuelToEdit(null);
        return true;
      }
      if (showServiceEntries) {
        setShowServiceEntries(false);
        setSelectedVehicleId(null);
        return true;
      }
      if (showAddVehicle) {
        setShowAddVehicle(false);
        return true;
      }
      // nothing to handle here -> allow default behaviour (exit app)
      return false;
    };

    if (Platform.OS === 'android') {
      const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => {
        // modern API: subscription.remove()
        try {
          subscription.remove();
        } catch (e) {
          // fallback (older RN) – attempt to removeEventListener
          try { BackHandler.removeEventListener && BackHandler.removeEventListener('hardwareBackPress', onHardwareBack); } catch (_) {}
        }
      };
    }
    return;
  }, [showRefuel, showAddService, showFuelEntries, showServiceEntries, showAddVehicle, openedFromEntries, openedFromServiceEntries, selectedFuelToEdit, selectedServiceToEdit]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moje pojazdy</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Modern card list */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.cardTitle}>{item.make} {item.model}</Text>
                  <Text style={styles.cardSubtitle}>{item.registration || 'Brak rejestracji'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => { setSelectedVehicleId(item.id); setSelectedFuelToEdit(null); setOpenedFromEntries(false); setShowRefuel(true); }}>
                    <Text style={styles.iconButtonText}>➕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity style={styles.ghostButton} onPress={() => { setSelectedVehicleId(item.id); setShowFuelEntries(true); }}>
                  <Text style={styles.ghostButtonText}>Historia tankowań</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.ghostButton} onPress={() => { setSelectedVehicleId(item.id); setSelectedServiceToEdit(null); setOpenedFromServiceEntries(false); setShowAddService(true); }}>
                  <Text style={styles.ghostButtonText}>Dodaj serwis</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.ghostButton} onPress={() => { setSelectedVehicleId(item.id); setShowServiceEntries(true); }}>
                  <Text style={styles.ghostButtonText}>Historia serwisów</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating action buttons and utility */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fab} onPress={() => setShowAddVehicle(true)}>
            <Text style={styles.fabText}>➕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: '#e74c3c', marginTop: 12 }]} onPress={onLogout}>
            <Text style={styles.fabText}>🔒</Text>
          </TouchableOpacity>
        </View>
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
          existingEntry={selectedFuelToEdit}
          onRefuelAdded={(patch?: any) => {
            setShowRefuel(false);
            // if refuel was opened from entries, return to entries view
            if (openedFromEntries) {
              setShowFuelEntries(true);
              setOpenedFromEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedFuelToEdit(null);
            // if the editor returned a patch, store it so FuelEntriesScreen can merge it
            if (patch) setFuelPatch(patch);
            loadVehicles();
          }}
          onCancel={() => {
            // deterministic cancel: close editor and return to previous view
            setShowRefuel(false);
            if (openedFromEntries) {
              setShowFuelEntries(true);
              setOpenedFromEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedFuelToEdit(null);
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
            setSelectedFuelToEdit(null);
          }}
          onEditEntry={(entry: any) => {
            // show Refuel screen in edit mode
            setSelectedFuelToEdit(entry);
            setOpenedFromEntries(true);
            // hide entries before showing editor to avoid both being visible
            setShowFuelEntries(false);
            setShowRefuel(true);
          }}
          patch={fuelPatch}
          clearPatch={() => setFuelPatch(null)}
        />
      )}

      {/* Add Service Screen */}
      {showAddService && selectedVehicleId && (
        <AddServiceScreen
          vehicleId={selectedVehicleId}
          existingEntry={selectedServiceToEdit}
          onServiceAdded={(patch?: any) => {
            setShowAddService(false);
            // if service editor was opened from entries, return to entries view
            if (openedFromServiceEntries) {
              setShowServiceEntries(true);
              setOpenedFromServiceEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedServiceToEdit(null);
            // If patch present, store and let ServiceEntries merge it. If patch indicates deletion, signal by id
            if (patch) setServicePatch(patch);
            loadVehicles();
          }}
          onCancel={() => {
            setShowAddService(false);
            if (openedFromServiceEntries) {
              setShowServiceEntries(true);
              setOpenedFromServiceEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedServiceToEdit(null);
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
          onEditEntry={(entry: any) => {
            setSelectedServiceToEdit(entry);
            setOpenedFromServiceEntries(true);
            // hide entries while editing
            setShowServiceEntries(false);
            setShowAddService(true);
          }}
          patch={servicePatch}
          clearPatch={() => setServicePatch(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f8fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#2c3e50', marginBottom: 12, textAlign: 'center' },
  error: { color: 'red', marginBottom: 10, textAlign: 'center' },

  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#34495e' },
  cardSubtitle: { fontSize: 13, color: '#7f8c8d', marginTop: 4 },

  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2e86de', alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  ghostButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  ghostButtonText: { color: '#34495e', fontWeight: '600' },

  fabContainer: { position: 'absolute', right: 18, bottom: 24, alignItems: 'center' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2e86de', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});