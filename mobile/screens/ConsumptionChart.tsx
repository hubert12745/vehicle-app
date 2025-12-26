import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, Dimensions, Platform } from 'react-native';
// react-native-chart-kit will be dynamically imported on native environments to avoid
// bundling native-only deps when the component is required on web.

type FuelEntry = {
  id?: number | string;
  date?: string; // ISO date
  odometer: number; // km
  liters: number; // l
};

export default function ConsumptionChart({ entries }: { entries: FuelEntry[] }) {
  const [WebChart, setWebChart] = useState<any>(null);
  const [NativeLineChart, setNativeLineChart] = useState<any>(null);

  useEffect(() => {
    // dynamically import web-only chart library or native react-native-chart-kit as needed
    (async () => {
      if (Platform.OS === 'web') {
        try {
          // chart.js auto-registers controllers when imported like this
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await import('chart.js/auto');
          const mod = await import('react-chartjs-2');
          setWebChart(() => mod.Line);
        } catch (e) {
          console.warn('Web chart libs not available:', e);
        }
      } else {
        try {
          const mod = await import('react-native-chart-kit');
          // Some bundlers export the chart as default or named; use named LineChart if available
          const LC = (mod && (mod.LineChart || mod.default?.LineChart)) || mod.LineChart || mod.default || null;
          setNativeLineChart(() => LC);
        } catch (e) {
          console.warn('react-native-chart-kit not available on native env:', e);
        }
      }
    })();
  }, []);

  const points = useMemo(() => {
    if (!Array.isArray(entries) || entries.length < 2) return [];
    const sorted = [...entries].sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
    const pts: { x: number; y: number; id?: any; date?: string }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const deltaKm = (cur.odometer || 0) - (prev.odometer || 0);
      if (!deltaKm || deltaKm <= 0) continue;
      const liters = cur.liters || 0;
      const consumption = (liters / deltaKm) * 100;
      pts.push({ x: cur.odometer, y: Number(consumption.toFixed(2)), id: cur.id, date: cur.date });
    }
    return pts;
  }, [entries]);

  if (!points || points.length === 0) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ color: '#666' }}>Za mało danych do wygenerowania wykresu spalania (potrzebne min. 2 wpisy).</Text>
      </View>
    );
  }

  const values = points.map((p) => p.y);
  const labels = points.map((p) => (p.x ? String(p.x) : ''));

  // simple anomaly detection (mean + 2*std)
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
  const threshold = mean + 2 * std;

  const screenWidth = Math.min(Dimensions.get('window').width - 48, 800);

  // compute y axis bounds to force numeric scale in Chart.js
  const yMinValue = Math.max(0, Math.floor((Math.min(...values) || 0) - 1));
  const yMaxValue = Math.ceil((Math.max(...values) || 0) + 1);

  // If running on web and web chart component loaded, render react-chartjs-2 Line
  if (Platform.OS === 'web' && WebChart) {
    const data = {
      labels,
      datasets: [{ /* no label to avoid legend/label conflicts */ data: values, borderColor: '#0A84FF', backgroundColor: 'rgba(10,132,255,0.1)' }],
    };
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          type: 'linear',
          beginAtZero: yMinValue === 0,
          min: yMinValue,
          max: yMaxValue,
          title: { display: true, text: 'L/100km' },
           ticks: {
             display: true,
             autoSkip: false,
             // Chart.js typically calls ticks callback as (value, index, ticks)
             callback: function (value: any) {
               const n = Number(String(value).replace(',', '.'));
               if (!isFinite(n)) return '';
               return n.toFixed(2);
             },
           },
         },
       },
     };

    return (
      <View style={{ paddingVertical: 8, height: 320 }}>
        <Text style={{ fontWeight: '600', marginBottom: 6 }}>Wykres spalania (L/100km)</Text>
        <View style={{ flex: 1 }}>
          {/* @ts-ignore */}
          <WebChart data={data} options={options} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <Text style={{ color: '#666', fontSize: 12 }}>Średnie: {mean.toFixed(2)} L/100km</Text>
          <Text style={{ color: '#666', fontSize: 12, marginLeft: 12 }}>Próg anomalii: {threshold.toFixed(2)} L/100km</Text>
        </View>
      </View>
    );
  }

  // If native environment: prefer to render LineChart from react-native-chart-kit when available
  if (Platform.OS !== 'web') {
    if (NativeLineChart) {
      const RNLineChart = NativeLineChart;
      const chartConfig = {
        backgroundColor: '#ffffff',
        backgroundGradientFrom: '#ffffff',
        backgroundGradientTo: '#ffffff',
        decimalPlaces: 2,
        color: (opacity = 1) => `rgba(10,132,255, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
        style: { borderRadius: 8 },
        propsForDots: { r: '4', strokeWidth: '0' },
      };

      return (
        <View style={{ paddingVertical: 8 }}>
          <Text style={{ fontWeight: '600', marginBottom: 6 }}>Wykres spalania (L/100km)</Text>
          {/* @ts-ignore */}
          <RNLineChart
            data={{ labels: labels, datasets: [{ data: values }] }}
            width={screenWidth}
            height={220}
            yAxisSuffix=" L/100km"
            // ensure numeric tick labels are formatted with 2 decimals
            // @ts-ignore
            formatYLabel={(y: string) => {
              if (y === null || y === undefined || y === '') return '';
              const n = Number(String(y).replace(/[^0-9.,-]/g, '').replace(',', '.'));
              if (!isFinite(n)) return '';
              return n.toFixed(2);
            }}
            yAxisInterval={1}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 8 }}
          />

          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Text style={{ color: '#666', fontSize: 12 }}>Średnie: {mean.toFixed(2)} L/100km</Text>
            <Text style={{ color: '#666', fontSize: 12, marginLeft: 12 }}>Próg anomalii: {threshold.toFixed(2)} L/100km</Text>
          </View>
        </View>
      );
    }

    // Fallback: lightweight sparkline/bar view when native chart lib is not available
    const CHART_H = 160;
    const CHART_W = Math.min(screenWidth, 600);
    const range = Math.max(0.0001, yMaxValue - yMinValue);

    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ fontWeight: '600', marginBottom: 6 }}>Wykres spalania (L/100km)</Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, width: CHART_W, backgroundColor: '#fff', borderRadius: 8, padding: 8 }}>
          {/* left column showing max label */}
          <View style={{ position: 'absolute', left: 8, top: 6 }}>
            <Text style={{ fontSize: 11, color: '#666' }}>{yMaxValue.toFixed(2)}</Text>
          </View>
          <View style={{ position: 'absolute', left: 8, bottom: 6 }}>
            <Text style={{ fontSize: 11, color: '#666' }}>{yMinValue.toFixed(2)}</Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1, alignItems: 'flex-end', marginLeft: 40 }}>
            {values.map((v, i) => {
              const norm = Math.max(0, Math.min(1, (v - yMinValue) / range));
              const h = Math.max(4, Math.round(norm * (CHART_H - 24)));
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', marginHorizontal: 4 }}>
                  <View style={{ width: '100%', height: h, backgroundColor: '#0A84FF', borderRadius: 4 }} />
                  <Text style={{ fontSize: 10, color: '#444', marginTop: 6 }}>{v.toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Text style={{ color: '#666', fontSize: 12 }}>Średnie: {mean.toFixed(2)} L/100km</Text>
          <Text style={{ color: '#666', fontSize: 12, marginLeft: 12 }}>Próg anomalii: {threshold.toFixed(2)} L/100km</Text>
        </View>
      </View>
    );
  }

  return null;
}
