import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, BackHandler, Platform, LayoutAnimation, UIManager } from "react-native";
import api from "../api";
import AddVehicleScreen from "./AddVehicle";
import RefuelScreen from "./Refuel";
import FuelEntriesScreen from "./FuelEntries";
import AddServiceScreen from "./AddService";
import ServiceEntriesScreen from "./ServiceEntries";
import ViewFuel from './ViewFuel';
import ViewService from './ViewService';
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

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
  const [viewFuelEntry, setViewFuelEntry] = useState<any | null>(null);
  const [viewServiceEntry, setViewServiceEntry] = useState<any | null>(null);

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
    // enable LayoutAnimation on Android
    if (Platform.OS === 'android') {
      // @ts-ignore
      UIManager.setLayoutAnimationEnabledExperimental && UIManager.setLayoutAnimationEnabledExperimental(true);
    }

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
        try { subscription.remove(); } catch (e) { try { BackHandler.removeEventListener && BackHandler.removeEventListener('hardwareBackPress', onHardwareBack); } catch (_) {} }
      };
    }
    return;
  }, [showRefuel, showAddService, showFuelEntries, showServiceEntries, showAddVehicle, openedFromEntries, openedFromServiceEntries, selectedFuelToEdit, selectedServiceToEdit]);

  return (
    <View style={theme.page}>
      <Text style={theme.headerTitle}>Moje pojazdy</Text>

      {error && <Text style={[theme.headerSubtitle, { color: 'red' }]}>{error}</Text>}

      {/* Modern card list */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={[theme.card, styles.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.cardTitle}>{item.make} {item.model}</Text>
                  <Text style={styles.cardSubtitle}>{item.registration || 'Brak rejestracji'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => { setSelectedVehicleId(item.id); setSelectedFuelToEdit(null); setOpenedFromEntries(false); setShowRefuel(true); }}>
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                <View style={styles.buttonsGrid}>
                  <View style={styles.col}>
                    <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(item.id); setShowFuelEntries(true); }}>
                      <Ionicons name="speedometer-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                      <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Tankowania</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.col}>
                    <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(item.id); setSelectedServiceToEdit(null); setOpenedFromServiceEntries(false); setShowAddService(true); }}>
                      <Ionicons name="construct-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                      <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Serwis</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.col}>
                    <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(item.id); setShowServiceEntries(true); }}>
                      <Ionicons name="time-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                      <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Historia</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating action buttons and utility */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fab} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowAddVehicle(true); }}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: '#e74c3c', marginTop: 12 }]} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Add Vehicle Screen */}
      {showAddVehicle && (
        <AddVehicleScreen
          onVehicleAdded={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowAddVehicle(false); loadVehicles(); }}
        />
      )}

      {/* Refuel Screen */}
      {showRefuel && selectedVehicleId && (
        <RefuelScreen
          vehicleId={selectedVehicleId}
          existingEntry={selectedFuelToEdit}
          onRefuelAdded={(patch?: any) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowRefuel(false);
            if (openedFromEntries) {
              setShowFuelEntries(true);
              setOpenedFromEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedFuelToEdit(null);
            if (patch) setFuelPatch(patch);
            loadVehicles();
          }}
          onCancel={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowFuelEntries(false);
            setSelectedVehicleId(null);
            setSelectedFuelToEdit(null);
          }}
          onEditEntry={(entry: any) => {
            // show Refuel screen in edit mode
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedFuelToEdit(entry);
            setOpenedFromEntries(true);
            setShowFuelEntries(false);
            setShowRefuel(true);
          }}
          onViewEntry={(entry:any)=>{
            setViewFuelEntry(entry);
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
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowAddService(false);
            if (openedFromServiceEntries) {
              setShowServiceEntries(true);
              setOpenedFromServiceEntries(false);
            } else {
              setSelectedVehicleId(null);
            }
            setSelectedServiceToEdit(null);
            if (patch) setServicePatch(patch);
            loadVehicles();
          }}
          onCancel={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowServiceEntries(false);
            setSelectedVehicleId(null);
          }}
          onEditEntry={(entry: any) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedServiceToEdit(entry);
            setOpenedFromServiceEntries(true);
            setShowServiceEntries(false);
            setShowAddService(true);
          }}
          onViewEntry={(entry:any)=> setViewServiceEntry(entry)}
          patch={servicePatch}
          clearPatch={() => setServicePatch(null)}
        />
      )}

      {/* View detail screens */}
      {viewFuelEntry && (
        <ViewFuel entry={viewFuelEntry} onEdit={(e)=>{ setViewFuelEntry(null); setSelectedFuelToEdit(e); setShowRefuel(true); }} onDelete={(id)=>{ setViewFuelEntry(null); setFuelPatch({ id, _deleted: true }); }} onClose={() => setViewFuelEntry(null)} />
      )}

      {viewServiceEntry && (
        <ViewService entry={viewServiceEntry} onEdit={(e)=>{ setViewServiceEntry(null); setSelectedServiceToEdit(e); setShowAddService(true); }} onDelete={(id)=>{ setViewServiceEntry(null); setServicePatch({ id, _deleted: true }); }} onClose={() => setViewServiceEntry(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // container: { flex: 1, padding: 16, backgroundColor: '#f6f8fb' },
  // title: { fontSize: 24, fontWeight: '700', color: '#2c3e50', marginBottom: 12, textAlign: 'center' },
  // error: { color: 'red', marginBottom: 10, textAlign: 'center' },

  // small overrides layered on top of theme.card
  card: { marginBottom: 12 },

  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2e86de', alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  ghostButton: { paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  ghostButtonText: { color: '#34495e', fontWeight: '600', textAlign: 'center', flexWrap: 'wrap', fontSize: 14 },
  buttonsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' },
  buttonsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  col: { width: '50%', paddingHorizontal: 6, paddingBottom: 8 },
  ghostButtonFullWidth: { width: '100%' },
  ghostButtonItem: { width: '48%', marginBottom: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  ghostButtonCenter: { alignSelf: 'center', marginLeft: 'auto', marginRight: 'auto' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },

  fabContainer: { position: 'absolute', right: 18, bottom: 24, alignItems: 'center' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2e86de', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
