export const STORAGE_KEY = "study-companion-app-data";

const LEGACY_USER_KEY = "study-companion-user";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadAppData(defaultData) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      return isObject(stored) ? { ...defaultData, ...stored } : defaultData;
    }

    const legacyUser = window.localStorage.getItem(LEGACY_USER_KEY);
    if (legacyUser) {
      return { ...defaultData, currentUser: JSON.parse(legacyUser) };
    }
  } catch {
    return defaultData;
  }

  return defaultData;
}

export function saveAppData(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.localStorage.removeItem(LEGACY_USER_KEY);
    return true;
  } catch {
    return false;
  }
}
