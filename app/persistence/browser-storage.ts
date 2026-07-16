import type { KeyValueStorage } from "../../lib/persistence/local-project-store";

const PROBE_KEY = "__lekin_lab_storage_probe__";

/**
 * The one place allowed to touch `window.localStorage` directly. Returns
 * null during SSR (`window` undefined) and when storage exists but throws
 * on access (e.g. Safari private browsing) - callers treat null as "local
 * persistence unavailable right now" and degrade gracefully rather than
 * crashing.
 */
export function getBrowserLocalStorage(): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    window.localStorage.setItem(PROBE_KEY, "1");
    window.localStorage.removeItem(PROBE_KEY);
    return window.localStorage;
  } catch {
    return null;
  }
}
