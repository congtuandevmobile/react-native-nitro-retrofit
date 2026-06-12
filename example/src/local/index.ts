type AuthKey = '@TOKEN' | '@REFRESH_TOKEN';

// In production replace with SecureStore / MMKV / Keychain
const store: Partial<Record<AuthKey, string>> = {};

const LocalServices = {
  getAuthKey(key: AuthKey): string | undefined {
    return store[key];
  },
  setAuthKey(key: AuthKey, value: string): void {
    store[key] = value;
  },
  removeAuthKey(key: AuthKey): void {
    delete store[key];
  },
};

export default LocalServices;
