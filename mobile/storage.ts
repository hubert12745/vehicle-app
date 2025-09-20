import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// helper sprawdzający czy SecureStore jest wspierane
async function isSecureStoreAvailable() {
  try {
    await SecureStore.getItemAsync("test_key");
    return true;
  } catch {
    return false;
  }
}

const Storage = {
  async setItem(key: string, value: string) {
    if (await isSecureStoreAvailable()) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },

  async getItem(key: string) {
    if (await isSecureStoreAvailable()) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  },

  async removeItem(key: string) {
    if (await isSecureStoreAvailable()) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
};

export default Storage;
