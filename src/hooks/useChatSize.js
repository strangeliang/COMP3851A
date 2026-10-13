import { useEffect, useState } from "react";

const storageKey = "study-help-chat-size";
const changeEvent = "study-help-chat-size-change";
export const chatWindowSizes = {
  compact: { width: 440, height: 640, en: "Compact", zh: "紧凑" },
  standard: { width: 560, height: 760, en: "Standard", zh: "标准" },
  large: { width: 740, height: 880, en: "Large", zh: "宽敞" },
};
const validSize = (value) => Object.hasOwn(chatWindowSizes, value) ? value : "standard";

function readSize() {
  try { return validSize(window.localStorage.getItem(storageKey)); }
  catch { return "standard"; }
}

export default function useChatSize() {
  const [size, updateSize] = useState(readSize);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event) => {
      if (event.type === changeEvent) updateSize(validSize(event.detail));
      else if (event.key === storageKey || event.key === null) updateSize(readSize());
    };
    window.addEventListener(changeEvent, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(changeEvent, sync); window.removeEventListener("storage", sync); };
  }, []);

  function setSize(value) {
    const next = validSize(value);
    updateSize(next);
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(storageKey, next); } catch { /* Still apply this preference for the current page. */ }
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: next }));
  }

  return [size, setSize];
}
