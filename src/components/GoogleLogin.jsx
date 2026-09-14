import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../services/apiClient";

let sdk;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!sdk) sdk = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { script.remove(); sdk = null; reject(new Error("Cannot load Google sign-in. Check your connection and refresh.")); };
    document.head.appendChild(script);
  });
  return sdk;
}
export default function GoogleLogin() {
  const host = useRef(null);
  const [message, setMessage] = useState("Checking Google sign-in…");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest("/auth/google/config").then(async (config) => {
      if (!active) return;
      if (!config.enabled) { setMessage("Google sign-in is not configured yet. Please use email and password."); return; }
      await loadGoogle();
      if (!active) return;
      window.google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, auto_select: false, callback: async ({ credential }) => {
        if (!active) return;
        setMessage("Signing in with Google…");
        try {
          await apiRequest("/auth/google", { method: "POST", body: { credential } });
          if (active) window.location.assign("/");
        } catch (error) { if (active) setMessage(`${error.message} Refresh this page before retrying.`); }
      } });
      window.google.accounts.id.renderButton(host.current, { type: "standard", theme: "outline", size: "large", text: "signin_with", width: 280 });
      setReady(true);
      setMessage("First-time Google users receive a new student account.");
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  return <section style={{ marginTop: 16 }} aria-label="Google sign-in">
    {!ready && <button type="button" disabled style={{ width: "100%", minHeight: 44, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "#fff", border: "1px solid #dadce0", borderRadius: 6, color: "#3c4043", fontSize: 14, fontWeight: 500, cursor: "not-allowed" }}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.87 46.98 24.55Z" />
        <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
      </svg>
      <span>Sign in with Google</span>
    </button>}
    <div ref={host} /><p className="login-support-note" role="status">{message}</p>
  </section>;
}
