import axios from "axios";
import Storage from "./storage";
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Resolve base URL with this priority:
// 1) If EXPO_API_URL or __DEV__ environment override is provided, use it.
// 2) If running under Expo and debuggerHost is present, derive the host part (works for physical devices on same LAN).
// 3) If Android emulator, use 10.0.2.2 which maps to host machine.
// 4) Otherwise fall back to localhost.

function getDevBaseUrl() {
  // allow manual override via global variable (set in Expo or Metro env)
  // @ts-ignore
  const envUrl = (global as any).EXPO_API_URL || (process && (process.env as any)?.EXPO_API_URL);
  if (envUrl) {
    console.log('Using EXPO_API_URL override:', envUrl);
    return envUrl;
  }

  const port = '8000';

  // Expo provides debuggerHost that contains ip:port of the dev machine when running in Expo Go
  try {
    const debuggerHost = Constants?.manifest?.debuggerHost || (Constants as any)?.debuggerHost;
    if (debuggerHost && typeof debuggerHost === 'string') {
      const host = debuggerHost.split(':')[0];
      const url = `http://${host}:${port}`;
      console.log('Derived API host from Expo debuggerHost:', url);
      return url;
    }
  } catch (e) {
    // ignore
  }

  if (Platform.OS === 'android') {
    const url = `http://10.0.2.2:${port}`; // Android emulator -> host machine
    console.log('Platform is Android, using emulator mapping:', url);
    return url;
  }

  const url = `http://localhost:${port}`;
  console.log('Falling back to:', url);
  return url;
}

const api = axios.create({
  baseURL: getDevBaseUrl(),
  timeout: 10000,
});

// Interceptor automatycznie dodaje token JWT
api.interceptors.request.use(async (config) => {
  const token = await Storage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log("Token being sent:", token);
  return config;
});

export async function updateService(id: number, payload: any) {
  return api.put(`/service/${id}`, payload);
}

export async function getServicesForVehicle(vehicleId: number) {
  return api.get(`/service/vehicle/${vehicleId}`);
}

export async function deleteService(id: number) {
  return api.delete(`/service/${id}`);
}

export default api;
