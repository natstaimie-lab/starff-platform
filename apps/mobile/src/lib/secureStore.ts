/**
 * LargeSecureStore — a StorageAdapter for Supabase Auth that keeps the
 * session encrypted at rest using the device's hardware-backed secure store.
 *
 * Why not use expo-secure-store directly? It has a ~2KB per-value limit and
 * Supabase sessions (access + refresh JWT) can exceed that. So we:
 *   1. generate a random AES-256 key per storage key,
 *   2. keep that key in expo-secure-store (Keychain / Keystore),
 *   3. store only the AES-encrypted ciphertext in AsyncStorage.
 *
 * Result: the refresh/access tokens are never written to disk in plain text,
 * satisfying "never store full authentication tokens in unsecured local
 * storage". This is the pattern recommended in the Supabase Expo guide.
 */
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';

// SecureStore keys must match [A-Za-z0-9._-]; namespace ours to avoid clashes.
function encryptionKeyName(key: string): string {
  return `starff_enc_${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1),
    );
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(
      encryptionKeyName(key),
      aesjs.utils.hex.fromBytes(encryptionKey),
    );
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(
    key: string,
    value: string,
  ): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(
      encryptionKeyName(key),
    );
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      // Corrupt / key rotated — treat as signed out rather than crash.
      await this.removeItem(key);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(encryptionKeyName(key));
  }
}

export const largeSecureStore = new LargeSecureStore();
