import { invoke } from "@tauri-apps/api/core";

/**
 * OS keychain integration for the API key.
 *
 * The Rust backend (keyring_get/set/delete) stores the key in the system
 * keychain (Windows Credential Manager / macOS Keychain / the Linux Secret
 * Service). All functions degrade gracefully: when the keychain is
 * unavailable, `saveVerifiedApiKey` returns `false` so the caller can keep
 * the key session-only instead of writing it to disk.
 */

const KEYCHAIN_ACCOUNT = "api_key";

/** The keychain account holding the API key (a reference, not a secret). */
export const API_KEY_ACCOUNT = KEYCHAIN_ACCOUNT;

export async function loadApiKeyFromKeychain(): Promise<string | null> {
  try {
    return (await invoke<string | null>("keyring_get", {
      key: KEYCHAIN_ACCOUNT,
    })) ?? null;
  } catch (err) {
    console.warn(
      "Keychain read failed; falling back to a session-only key:",
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
      "Keychain write failed; the key is kept for this session only:",
      typeof err === "string" ? err : err,
    );
    return false;
  }
}

/**
 * Store the key AND verify the read-back. Returns false (and removes the
 * half-written entry) when the keychain could not store or read the value:
 * the caller must then treat the key as session-only rather than believe a
 * store that cannot actually return it.
 */
export async function saveVerifiedApiKey(value: string): Promise<boolean> {
  if (!(await saveApiKeyToKeychain(value))) return false;
  const readBack = await loadApiKeyFromKeychain();
  if (readBack !== value) {
    await deleteApiKeyFromKeychain();
    return false;
  }
  return true;
}

export async function deleteApiKeyFromKeychain(): Promise<boolean> {
  try {
    await invoke("keyring_delete", { key: KEYCHAIN_ACCOUNT });
    return true;
  } catch {
    return false;
  }
}
