const STORAGE_KEY = "study-workspace-session-v1";
let fallback = null;
let memoryAuthoritative = false;
const memoryValues = new Map();
const memoryListeners = new Set();
function store() {
  if (memoryAuthoritative && fallback) return fallback;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.id === "string" && parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
        fallback = parsed;
        return parsed;
      }
    }
  } catch { memoryAuthoritative = true; }
  if (!fallback) fallback = { id: crypto.randomUUID(), values: {} };
  return fallback;
}
function save(value) {
  fallback = value;
  memoryAuthoritative = true;
  try {
    if (window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      memoryAuthoritative = false;
    }
  } catch { /* Keep newer in-memory state authoritative until a write succeeds. */ }
}
export function workspaceSessionId() {
  const value = store();
  save(value);
  return value.id;
}
export function resetWorkspaceSession() {
  save({ id: crypto.randomUUID(), values: {} });
  memoryValues.clear();
  memoryListeners.forEach(listener => listener());
}
export function readWorkspaceMemory(key, initial, sessionId) {
  if (store().id !== sessionId) return initial;
  return memoryValues.has(key) ? memoryValues.get(key) : initial;
}
export function writeWorkspaceMemory(key, update, sessionId) {
  if (store().id !== sessionId) return false;
  const previous = memoryValues.get(key);
  const next = typeof update === 'function' ? update(previous) : update;
  if (next !== previous) {
    memoryValues.set(key, next);
    memoryListeners.forEach(listener => listener());
  }
  return true;
}
export function subscribeWorkspaceMemory(listener) {
  memoryListeners.add(listener);
  return () => memoryListeners.delete(listener);
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
