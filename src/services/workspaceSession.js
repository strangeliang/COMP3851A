const STORAGE_KEY = "study-workspace-session-v1";
let fallback = null;
function store() {
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.id === "string" && parsed.values && typeof parsed.values === "object") return parsed;
    }
  } catch { /* Storage unavailable: use memory. */ }
  if (!fallback) fallback = { id: crypto.randomUUID(), values: {} };
  return fallback;
}
function save(value) {
  fallback = value;
  try { window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Memory fallback. */ }
}
export function workspaceSessionId() {
  const value = store();
  save(value);
  return value.id;
}
export function resetWorkspaceSession() {
  save({ id: crypto.randomUUID(), values: {} });
}
export function readWorkspaceState(key, initial) {
  const value = store();
  return Object.hasOwn(value.values, key) ? value.values[key] : initial;
}
export function writeWorkspaceState(key, data, sessionId) {
  const value = store();
  // Ignore responses belonging to a previous login.
  if (value.id !== sessionId) return;
  value.values[key] = data;
  save(value);
}
