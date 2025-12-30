import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import api from '../api';
import theme from '../theme';

export default function TopList() {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<'cost_per_km'|'avg_consumption'>('cost_per_km');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/ranking/top10?metric=${metric}&period=last_6_months`);
      if (res.status === 200) {
        setRanking(res.data.ranking || []);
      } else {
        setError('Błąd ładowania rankingu');
      }
    } catch (e:any) {
      setError('Błąd ładowania rankingu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [metric]);

  if (loading) return <View style={{ padding: 20 }}><ActivityIndicator /></View>;
  if (error) return <View style={{ padding: 20 }}><Text style={{ color: 'red' }}>{error}</Text></View>;

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setMetric('cost_per_km')} style={{ marginRight: 8 }}>
            <Text style={{ fontWeight: metric === 'cost_per_km' ? '700' : '400' }}>Koszt/km</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMetric('avg_consumption')}>
            <Text style={{ fontWeight: metric === 'avg_consumption' ? '700' : '400' }}>Średnie spalanie</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={load}><Text style={{ color: '#2e86de' }}>Odśwież</Text></TouchableOpacity>
      </View>

      <FlatList
        data={ranking}
        keyExtractor={(item) => String(item.position)}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '700' }}>#{item.position} — {item.value}</Text>
            <Text style={{ color: '#666' }}>{item.percentile}% percentile</Text>
          </View>
        )}
      />
    </View>
  );
}

