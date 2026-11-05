// Trailhead runs as a standalone app now, so persistence uses the browser's
// localStorage instead of the Claude-artifact-only `window.storage` API.
// The get/set/delete shape is kept async so the rest of the app doesn't care.

const PREFIX = "trailhead:";

export async function storageGet(key: string): Promise<{ value: string } | null> {
  const raw = localStorage.getItem(PREFIX + key);
  return raw === null ? null : { value: raw };
}

export async function storageSet(key: string, value: string): Promise<void> {
  localStorage.setItem(PREFIX + key, value);
}

export async function storageDelete(key: string): Promise<void> {
  localStorage.removeItem(PREFIX + key);
}
