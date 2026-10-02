const KEY = "nexa-chunk-reload";
const COOLDOWN_MS = 60_000;
export function recoverChunkError(error, browser, now = Date.now()) {
  if (!/ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(error?.name || "") + " " + String(error?.message || ""))) return false;
  try {
    const previous = browser.sessionStorage.getItem(KEY);
    if (previous !== null && now - Number(previous) < COOLDOWN_MS) return false;
    browser.sessionStorage.setItem(KEY, String(now));
  } catch { return false; } // Cannot guard against a reload loop without storage.
  browser.location.reload();
  return true;
}
