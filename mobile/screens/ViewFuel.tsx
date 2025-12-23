import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { deleteFuel } from '../api';

export default function ViewFuel({ entry, onEdit, onDelete, onClose }: { entry: any, onEdit: (e:any)=>void, onDelete: (id:number)=>void, onClose: ()=>void }) {
  const handleDelete = async () => {
    Alert.alert('Usuń wpis', 'Na pewno usunąć wpis tankowania?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          const res = await deleteFuel(entry.id);
          if (res && (res.status === 200 || res.status === 204)) {
            Alert.alert('Usunięto', 'Wpis został usunięty.');
            onDelete(entry.id);
            return;
          } else if (res && res.status === 404) {
            Alert.alert('Błąd', 'Wpis nie istnieje na serwerze. Odświeżam listę.');
            onDelete(entry.id);
            return;
          }
          Alert.alert('Błąd', 'Nie udało się usunąć wpisu.');
        } catch (e:any) {
          console.error('Delete fuel failed', e);
          Alert.alert('Błąd', e?.message || 'Nieznany błąd');
        }
      } }
    ]);
  };

  return (
    <View style={theme.page}>
      <View style={[theme.card, { marginTop: 16 }]}>
        <Text style={theme.headerTitle}>Szczegóły tankowania</Text>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.row}><Text style={styles.label}>Data: </Text>{new Date(entry.date).toLocaleString()}</Text>
          <Text style={styles.row}><Text style={styles.label}>Stan licznika: </Text>{entry.odometer} km</Text>
          <Text style={styles.row}><Text style={styles.label}>Ilość paliwa: </Text>{entry.liters} L</Text>
          <Text style={styles.row}><Text style={styles.label}>Cena/l: </Text>{entry.price_per_liter.toFixed(2)} PLN</Text>
          <Text style={styles.row}><Text style={styles.label}>Całkowity koszt: </Text>{entry.total_cost.toFixed(2)} PLN</Text>
          {entry.notes ? <Text style={styles.row}><Text style={styles.label}>Notatki: </Text>{entry.notes}</Text> : null}
        </View>

        <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <TouchableOpacity style={[theme.ghostBtn, { flex: 1, marginRight: 8, flexDirection: 'row', alignItems: 'center', justifyContent:'center' }]} onPress={() => onEdit(entry)}>
            <Ionicons name="create-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
            <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Edytuj</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[theme.ghostBtn, { flex: 1, marginLeft: 8, borderColor: '#e74c3c', borderWidth:1, flexDirection:'row', alignItems:'center', justifyContent:'center' }]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color="#e74c3c" />
            <Text style={[theme.ghostBtnText, { marginLeft: 8, color: '#e74c3c' }]}>Usuń</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12 }}>
          <TouchableOpacity style={[theme.ghostBtn, { justifyContent:'center' }]} onPress={onClose}>
            <Ionicons name="arrow-back-outline" size={16} color={theme.headerTitle.color || '#34495e'} />
            <Text style={[theme.ghostBtnText, { marginLeft: 8 }]}>Powrót</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 8, color: '#2c3e50' },
  label: { fontWeight: '700' }
});

