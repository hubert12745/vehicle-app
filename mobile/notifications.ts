import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, AppState } from 'react-native';
import { Alert } from 'react-native';
import api from './api';

let _pollIntervalHandle: any = null;
let _lastAppState = AppState.currentState;
let _scheduledIds = new Set<number>();

// Request permissions and get Expo push token then register it with backend
export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      console.warn('Push notifications are not supported on emulators/simulators');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Powiadomienia wyłączone', 'Nie przyznano uprawnień do powiadomień push');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    const platform = Platform.OS;

    // send token to backend
    try {
      await api.post('/devices/register', { token, platform });
      console.log('[NOTIF] Registered device token with backend');
    } catch (e) {
      console.warn('[NOTIF] Failed to register token with backend', e);
    }

    return token;
  } catch (e) {
    console.warn('[NOTIF] registerForPushNotificationsAsync failed', e);
    return null;
  }
}

// Configure notification handler (optional)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Fetch unread notifications from backend and schedule local notifications for them
export async function fetchAndScheduleNotifications() {
  try {
    const res = await api.get('/notifications');
    if (res?.status !== 200) return;
    const rows: any[] = res.data || [];
    for (const n of rows) {
      try {
        // if already scheduled or already read, skip
        if (_scheduledIds.has(n.id) || n.read) continue;
        // schedule immediate local notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Przypomnienie serwisowe',
            body: n.message,
            data: { notification_id: n.id, service_id: n.service_id }
          },
          // trigger null shows immediately in expo-notifications
          trigger: null
        });
        _scheduledIds.add(n.id);
        // mark notification read on server to prevent duplicate delivery
        try {
          await api.post(`/notifications/${n.id}/mark_read`);
        } catch (e) {
          console.warn('[NOTIF] Failed to mark notification read', e);
        }
      } catch (e) {
        console.warn('[NOTIF] scheduling failed for', n, e);
      }
    }
  } catch (e) {
    console.warn('[NOTIF] fetchAndScheduleNotifications failed', e);
  }
}

// Start periodic polling (intervalMs default 60s). Works in foreground; background behavior depends on platform/expo.
export function startNotificationsPoll(intervalMs: number = 60_000) {
  stopNotificationsPoll();
  // fetch once immediately
  fetchAndScheduleNotifications().catch(()=>{});
  _pollIntervalHandle = setInterval(() => {
    // only poll when app is active (foreground)
    try {
      if (AppState.currentState === 'active') {
        fetchAndScheduleNotifications().catch(()=>{});
      }
    } catch (e) { /* ignore */ }
  }, intervalMs);

  // listen to app state to trigger immediate fetch on resume
  AppState.addEventListener('change', _onAppStateChange);
}

export function stopNotificationsPoll() {
  try {
    if (_pollIntervalHandle) {
      clearInterval(_pollIntervalHandle);
      _pollIntervalHandle = null;
    }
  } catch (e) {}
  try {
    AppState.removeEventListener('change', _onAppStateChange);
  } catch (e) {}
}

function _onAppStateChange(nextAppState: string) {
  if (_lastAppState !== 'active' && nextAppState === 'active') {
    // resumed -> fetch immediately
    fetchAndScheduleNotifications().catch(()=>{});
  }
  _lastAppState = nextAppState;
}

export default {
  registerForPushNotificationsAsync,
  fetchAndScheduleNotifications,
  startNotificationsPoll,
  stopNotificationsPoll,
};
