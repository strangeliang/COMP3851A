import { useEffect, useState } from "react";

const key = "study-interface-preferences";
const eventName = "study-preferences-change";
const defaults = { answerStyle: "simple", quizDifficulty: "medium", readingSize: "standard" };
const choices = { answerStyle: ["simple", "detailed", "example", "hint"], quizDifficulty: ["easy", "medium", "hard"], readingSize: ["standard", "large"] };
function clean(value) {
  return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [name, choices[name].includes(value?.[name]) ? value[name] : fallback]));
}
function read() {
  try { return clean(JSON.parse(window.localStorage.getItem(key))); } catch { return { ...defaults }; }
}
export default function useStudyPreferences() {
  const [preferences, setPreferences] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = event => {
      if (event.type === eventName) setPreferences(clean(event.detail));
      else if (event.key === key || event.key === null) setPreferences(read());
    };
    window.addEventListener(eventName, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(eventName, sync); window.removeEventListener("storage", sync); };
  }, []);
  function update(name, value) {
    const next = clean({ ...read(), ...preferences, [name]: value });
    setPreferences(next);
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Apply for this page even if storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
  }
  return [preferences, update];
}
