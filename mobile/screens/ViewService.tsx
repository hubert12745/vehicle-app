import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { deleteService } from '../api';

export default function ViewService({ entry, onEdit, onDelete, onClose }: { entry: any, onEdit: (e:any)=>void, onDelete: (id:number)=>void, onClose: ()=>void }) {
  const handleDelete = async () => {
    Alert.alert('Usuń wpis', 'Na pewno usunąć wpis serwisowy?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          const res = await deleteService(entry.id);
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
          console.error('Delete service failed', e);
          Alert.alert('Błąd', e?.message || 'Nieznany błąd');
        }
      } }
    ]);
  };

  return (
    <View style={theme.page}>
      <View style={[theme.card, { marginTop: 16 }]}>
        <Text style={theme.headerTitle}>Szczegóły serwisu</Text>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.row}><Text style={styles.label}>Data: </Text>{new Date(entry.date).toLocaleString()}</Text>
          <Text style={styles.row}><Text style={styles.label}>Typ: </Text>{entry.type}</Text>
          {entry.description ? <Text style={styles.row}><Text style={styles.label}>Opis: </Text>{entry.description}</Text> : null}
          <Text style={styles.row}><Text style={styles.label}>Koszt: </Text>{entry.cost.toFixed(2)} PLN</Text>
          {entry.next_due_date ? <Text style={styles.row}><Text style={styles.label}>Następny serwis: </Text>{new Date(entry.next_due_date).toLocaleDateString()}</Text> : null}
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

