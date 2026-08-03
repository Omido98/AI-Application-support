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
  } catch (err) {
    console.warn(
      "Keychain read failed; falling back to config.json:",
      typeof err === "string" ? err : err,
    );
    return null;
  }
}

export async function saveApiKeyToKeychain(value: string): Promise<boolean> {
  try {
    await invoke("keyring_set", { key: KEYCHAIN_ACCOUNT, value });
    return true;
  } catch (err) {
    console.warn(
      "Keychain write failed; the key is stored in config.json instead:",
      typeof err === "string" ? err : err,
    );
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
