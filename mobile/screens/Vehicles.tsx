import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, BackHandler, Platform, LayoutAnimation, UIManager, Modal, ScrollView } from "react-native";
import api from "../api";
import AddVehicleScreen from "./AddVehicle";
import RefuelScreen from "./Refuel";
import FuelEntriesScreen from "./FuelEntries";
import AddServiceScreen from "./AddService";
import ServiceEntriesScreen from "./ServiceEntries";
import ViewFuel from './ViewFuel';
import ViewService from './ViewService';
import ConsumptionChart from './ConsumptionChart';
import Reports from './Reports';
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface Vehicle {
  id: number;
  make: string;
  model: string;
  registration?: string;
  vin?: string;
  start_odometer?: number;
}

export default function VehiclesScreen({
  token,
  onLogout,
  initialFocusedMode = false,
}: {
  token: string;
  onLogout: () => void;
  // when true, start the screen in focused (fokus) mode
  initialFocusedMode?: boolean;
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
  const [showReports, setShowReports] = useState<boolean>(false);

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

  // Recent entries for single-vehicle home view
  const [recentFuel, setRecentFuel] = useState<any[]>([]);
  const [recentService, setRecentService] = useState<any[]>([]);

  // Vehicle switcher / focused view for cleaning up main page
  const [currentVehicleIndex, setCurrentVehicleIndex] = useState<number>(0);
  const [focusedMode, setFocusedMode] = useState<boolean>(initialFocusedMode);
  const [showQuickMenu, setShowQuickMenu] = useState<boolean>(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState<boolean>(false);

  const loadRecentForVehicle = async (vid: number) => {
    try {
      const [fuelRes, serviceRes] = await Promise.all([
        api.get(`/fuel/vehicle/${vid}`),
        api.get(`/service/vehicle/${vid}`),
      ]);
      if (fuelRes.status === 200) setRecentFuel((fuelRes.data || []).slice(0, 6));
      if (serviceRes.status === 200) setRecentService((serviceRes.data || []).slice(0, 6));
    } catch (e) {
      // ignore; section will be empty
    }
  };

  const loadVehicles = async () => {
    try {
      const res = await api.get<Vehicle[]>("/vehicles/");
      if (res.status === 200) {
        setVehicles(res.data);
        setError(null);
        // set current selection and pre-fetch recent entries for the selected vehicle
        if (Array.isArray(res.data) && res.data.length > 0) {
          setCurrentVehicleIndex(0);
          const vid = res.data[0].id;
          setSelectedVehicleId(vid);
          // if only one vehicle, show focused home automatically
          if (res.data.length === 1) setFocusedMode(true);
          loadRecentForVehicle(vid);
        }
      } else {
        setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
      }
    } catch (err: any) {
      setError("Nie udało się pobrać danych. Sprawdź połączenie lub token.");
    }
  };

  // When selected vehicle index changes, update selectedVehicleId and load recents
  useEffect(() => {
    if (vehicles && vehicles.length > 0) {
      const idx = Math.min(currentVehicleIndex, vehicles.length - 1);
      const v = vehicles[idx];
      if (v) {
        setSelectedVehicleId(v.id);
        loadRecentForVehicle(v.id);
      }
    }
  }, [currentVehicleIndex, vehicles]);

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
          setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId);
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
          setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId);
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
      if (showReports) {
        setShowReports(false);
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
  }, [showRefuel, showAddService, showFuelEntries, showServiceEntries, showAddVehicle, showReports, openedFromEntries, openedFromServiceEntries, selectedFuelToEdit, selectedServiceToEdit]);

  useEffect(() => {
    // refresh recent lists immediately after edits/adds/deletes
    if (selectedVehicleId && (fuelPatch || servicePatch)) {
      loadRecentForVehicle(selectedVehicleId);
      // clear patches to avoid repeated refreshs
      if (fuelPatch) setFuelPatch(null);
      if (servicePatch) setServicePatch(null);
    }
  }, [fuelPatch, servicePatch, selectedVehicleId]);

  const prevVehicle = () => {
    if (!vehicles || vehicles.length === 0) return;
    setCurrentVehicleIndex((i) => (i - 1 + vehicles.length) % vehicles.length);
    setFocusedMode(true);
  };

  const nextVehicle = () => {
    if (!vehicles || vehicles.length === 0) return;
    setCurrentVehicleIndex((i) => (i + 1) % vehicles.length);
    setFocusedMode(true);
  };

  const openAddVehicleFromMenu = () => {
    setShowHeaderMenu(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAddVehicle(true);
  };

  const openAddRefuelFromMenu = () => {
    setShowQuickMenu(false);
    const vid = selectedVehicleId || focusedVehicle?.id;
    if (!vid) {
      // fallback: open add vehicle screen first
      openAddVehicleFromMenu();
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedFuelToEdit(null);
    setOpenedFromEntries(false);
    setSelectedVehicleId(vid);
    setShowRefuel(true);
  };

  const openAddServiceFromMenu = () => {
    setShowQuickMenu(false);
    const vid = selectedVehicleId || focusedVehicle?.id;
    if (!vid) {
      openAddVehicleFromMenu();
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedServiceToEdit(null);
    setOpenedFromServiceEntries(false);
    setSelectedVehicleId(vid);
    setShowAddService(true);
  };

  const focusedVehicle = vehicles && vehicles.length > 0 ? vehicles[currentVehicleIndex] : null;

  return (
    <View style={theme.page}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={theme.headerTitle}>Moje pojazdy</Text>
        {vehicles.length > 1 && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={prevVehicle} style={{ padding: 6, marginRight: 6 }}>
              <Ionicons name="chevron-back" size={20} color={theme.headerTitle.color || '#34495e'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFocusedMode((f) => !f)} style={{ padding: 6, marginRight: 6 }}>
              <Text style={{ color: '#0A84FF', fontWeight: '600' }}>{focusedMode ? 'Pokaż listę' : 'Fokus'}</Text>
            </TouchableOpacity>
            {/* Header menu trigger */}
            <TouchableOpacity onPress={() => setShowHeaderMenu((s) => !s)} style={{ padding: 6, marginRight: 6 }}>
              <Ionicons name="ellipsis-vertical" size={20} color={theme.headerTitle.color || '#34495e'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={nextVehicle} style={{ padding: 6 }}>
              <Ionicons name="chevron-forward" size={20} color={theme.headerTitle.color || '#34495e'} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Header dropdown menu (simple) */}
      {showHeaderMenu && (
        <View style={{ position: 'absolute', right: 18, top: 54, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, elevation: 6, zIndex: 100 }}>
          <TouchableOpacity accessibilityLabel="Dodaj pojazd" style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }} onPress={openAddVehicleFromMenu}>
            <Ionicons name="car-outline" size={18} color="#0B2545" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: '600' }}>Dodaj pojazd</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Raporty" style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setShowHeaderMenu(false); setShowReports(true); }}>
            <Ionicons name="bar-chart-outline" size={18} color="#0B2545" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: '600' }}>Raporty</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Wyloguj" style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setShowHeaderMenu(false); onLogout(); }}>
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: '600', color: '#FF3B30' }}>Wyloguj</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={[theme.headerSubtitle, { color: 'red' }]}>{error}</Text>}

      {/* If user has exactly one vehicle or user enabled focused mode, show compact home for focusedVehicle */}
      {( (vehicles.length === 1) || focusedMode ) && !showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && focusedVehicle && (
        <FlatList
          data={[1]}
          keyExtractor={() => 'focused-home'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 160 }}
          renderItem={() => (
            <View>
              <View style={[theme.card, styles.card]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={styles.cardTitle}>{focusedVehicle?.make} {focusedVehicle?.model}</Text>
                    <Text style={styles.cardSubtitle}>{focusedVehicle?.registration || 'Brak rejestracji'}</Text>
                    {focusedVehicle?.vin ? <Text style={{ color: '#7f8c8d', marginTop: 4 }}>VIN: {focusedVehicle.vin}</Text> : null}
                    {focusedVehicle?.start_odometer != null ? <Text style={{ color: '#7f8c8d', marginTop: 2 }}>Przebieg startowy: {focusedVehicle.start_odometer} km</Text> : null}
                  </View>
                  {/* removed inline add button (use FAB quick-menu instead) */}
                </View>

                <View style={{ marginTop: 12 }}>
                  <View style={styles.buttonsGrid}>
                    <View style={styles.col}>
                      <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId); setShowFuelEntries(true); }}>
                        <Ionicons name="speedometer-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                        <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>{focusedVehicle ? 'Tankowania' : 'Tankowania'}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.col}>
                      <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId); setShowAddService(true); }}>
                        <Ionicons name="construct-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                        <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Serwis</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.col}>
                      <TouchableOpacity style={[theme.ghostBtn, styles.actionBtn]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId); setShowServiceEntries(true); }}>
                        <Ionicons name="time-outline" size={18} color={theme.headerTitle.color || '#34495e'} />
                        <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Historia</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* Recent fuel entries (rendered as plain Views to avoid nested VirtualizedLists) */}
              <View style={[theme.card, { padding: 12, marginBottom: 12 }]}>
                <Text style={[theme.headerSubtitle, { marginBottom: 8 }]}>Ostatnie tankowania</Text>
                {recentFuel.length === 0 ? (
                  <Text style={{ color: '#666' }}>Brak wpisów tankowań</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true} contentContainerStyle={{ paddingVertical: 4 }}>
                    {recentFuel.map((item: any) => (
                      <TouchableOpacity key={String(item.id || Math.random())} style={{ paddingVertical: 8 }} onPress={() => setViewFuelEntry(item)}>
                        <Text style={{ fontWeight: '600' }}>{item.odometer} km — {item.liters} l</Text>
                        <Text style={{ color: '#666' }}>{new Date(item.date).toLocaleDateString()} • {item.total_cost} zł</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {/* Consumption chart — shows L/100km computed from recent entries (optional) */}
                <ConsumptionChart entries={recentFuel} />
                <TouchableOpacity style={{ marginTop: 8, alignSelf: 'flex-end' }} onPress={() => { setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId); setShowFuelEntries(true); }}>
                  <Text style={{ color: '#2e86de' }}>Pokaż wszystkie tankowania</Text>
                </TouchableOpacity>
              </View>

              {/* Recent service events (rendered as plain Views) */}
              <View style={[theme.card, { padding: 12, marginBottom: 12 }]}>
                <Text style={[theme.headerSubtitle, { marginBottom: 8 }]}>Ostatnie serwisy</Text>
                {recentService.length === 0 ? (
                  <Text style={{ color: '#666' }}>Brak wpisów serwisowych</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true} contentContainerStyle={{ paddingVertical: 4 }}>
                    {recentService.map((item: any) => (
                      <TouchableOpacity key={String(item.id || Math.random())} style={{ paddingVertical: 8 }} onPress={() => setViewServiceEntry(item)}>
                        <Text style={{ fontWeight: '600' }}>{item.type} — {item.cost} zł</Text>
                        <Text style={{ color: '#666' }}>{new Date(item.date).toLocaleDateString()}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity style={{ marginTop: 8, alignSelf: 'flex-end' }} onPress={() => { setSelectedVehicleId(focusedVehicle?.id ?? selectedVehicleId); setShowServiceEntries(true); }}>
                  <Text style={{ color: '#2e86de' }}>Pokaż historię serwisów</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Modern card list: show only when not in focusedMode and there are multiple vehicles */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && !focusedMode && vehicles.length > 1 && (
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
                  {item?.vin ? <Text style={{ color: '#7f8c8d', marginTop: 4 }}>VIN: {item.vin}</Text> : null}
                  {item?.start_odometer != null ? <Text style={{ color: '#7f8c8d', marginTop: 2 }}>Przebieg startowy: {item.start_odometer} km</Text> : null}
                </View>
                {/* removed inline add button (use FAB quick-menu instead) */}
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

      {/* Floating action buttons (FAB) */}
      {!showAddVehicle && !showRefuel && !showFuelEntries && !showAddService && !showServiceEntries && (
        <View style={[styles.fabContainer, { zIndex: 10000, elevation: 10000 }]}>
          <TouchableOpacity style={[styles.fab, { zIndex: 10001, elevation: 10001 }]} onPress={() => setShowQuickMenu((s) => !s)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.fab, { backgroundColor: '#e74c3c', marginTop: 12, zIndex: 10002, elevation: 10002 }]} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      { /* showHeaderMenu remains as before; quick-menu uses Modal to guarantee top-layer */ }
      {showQuickMenu && (
        <Modal
          transparent
          animationType="fade"
          visible={showQuickMenu}
          onRequestClose={() => setShowQuickMenu(false)}
          presentationStyle="overFullScreen"
          statusBarTranslucent={true}
        >
          <View style={{ flex: 1 }}>
            {/* full-screen overlay to dim background and catch taps */}
            <TouchableOpacity
              activeOpacity={1}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.15)' }}
              onPress={() => setShowQuickMenu(false)}
            />

            {/* small bubble anchored near FAB */}
            <View style={{ position: 'absolute', right: 18, bottom: 92, width: 220, backgroundColor: '#fff', borderRadius: 12, padding: 6, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, elevation: 120, zIndex: 10003 }}>
              <TouchableOpacity accessibilityLabel="Dodaj tankowanie" style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setShowQuickMenu(false); openAddRefuelFromMenu(); }}>
                <Ionicons name="water-outline" size={18} color="#0A84FF" style={{ marginRight: 10 }} />
                <Text style={{ fontWeight: '700' }}>Dodaj tankowanie</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Dodaj serwis" style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setShowQuickMenu(false); openAddServiceFromMenu(); }}>
                <Ionicons name="construct-outline" size={18} color="#0A84FF" style={{ marginRight: 10 }} />
                <Text style={{ fontWeight: '700' }}>Dodaj serwis</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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

      {/* Add / Edit Service Screen */}
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

      {/* Service Entries Screen */}
      {showServiceEntries && selectedVehicleId && (
        <ServiceEntriesScreen
          vehicleId={selectedVehicleId}
          onBack={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowServiceEntries(false);
            setSelectedVehicleId(null);
            setSelectedServiceToEdit(null);
          }}
          onEditEntry={(entry: any) => {
            // show AddService screen in edit mode
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedServiceToEdit(entry);
            setOpenedFromServiceEntries(true);
            setShowServiceEntries(false);
            setShowAddService(true);
          }}
          onViewEntry={(entry:any)=>{
            setViewServiceEntry(entry);
          }}
          patch={servicePatch}
          clearPatch={() => setServicePatch(null)}
        />
      )}

      {/* View Fuel Entry */}
      {viewFuelEntry && (
        <ViewFuel
          entry={viewFuelEntry}
          onClose={() => setViewFuelEntry(null)}
        />
      )}

      {/* View Service Entry */}
      {viewServiceEntry && (
        <ViewService
          entry={viewServiceEntry}
          onClose={() => setViewServiceEntry(null)}
        />
      )}

      {/* Reports modal-like screen */}
      {showReports && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 200 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Raporty</Text>
            <TouchableOpacity onPress={() => setShowReports(false)} style={{ padding: 8 }}>
              <Text style={{ color: '#2e86de' }}>Zamknij</Text>
            </TouchableOpacity>
          </View>
          {/* @ts-ignore */}
          <Reports />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0B2545',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  buttonsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  col: {
    flex: 1,
    marginHorizontal: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    alignItems: 'flex-end',
    zIndex: 10000,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
