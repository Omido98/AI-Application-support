import { invoke } from "@tauri-apps/api/core";

/**
 * OS keychain integration for the API key.
 *
 * The Rust backend (keyring_get/set/delete) stores the key in the system
 * keychain (Windows Credential Manager / macOS Keychain / libsecret).
 * All functions degrade gracefully: when the keychain is unavailable,
 * `saveApiKeyToKeychain` returns `false` so callers fall back to writing
 * the key into config.json instead.
 */

const KEYCHAIN_ACCOUNT = "api_key";

export async function loadApiKeyFromKeychain(): Promise<string | null> {
  try {
    return (await invoke<string | null>("keyring_get", {
      key: KEYCHAIN_ACCOUNT,
    })) ?? null;
  } catch {
    return null;
  }
}

export async function saveApiKeyToKeychain(value: string): Promise<boolean> {
  try {
    await invoke("keyring_set", { key: KEYCHAIN_ACCOUNT, value });
    return true;
  } catch {
    return false;
  }
}

export async function deleteApiKeyFromKeychain(): Promise<boolean> {
  try {
    await invoke("keyring_delete", { key: KEYCHAIN_ACCOUNT });
    return true;
  } catch {
    return false;
  }
}
