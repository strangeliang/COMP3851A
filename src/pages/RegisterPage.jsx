import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/apiClient";
import useBodyClass from "../hooks/useBodyClass";

export default function RegisterPage() {
  useBodyClass("user-app");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("Passwords do not match."); return; }
    setPending(true); setError("");
    try {
      await apiRequest("/auth/register", { method: "POST", body: { name: form.get("name"), email: form.get("email"), password: form.get("password") } });
      event.target.reset(); setDone(true);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <main className="login-modern-shell"><section className="login-form-panel" style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: 20 }}>
    <h1>Create student account</h1>
    {done ? <p role="status">Account created. You can now log in.</p> : <form className="login-form-modern" onSubmit={submit}>
      <label className="login-label" htmlFor="register-name">Name</label><input className="login-input" id="register-name" name="name" required maxLength={80} autoComplete="name" />
      <label className="login-label" htmlFor="register-email">Email</label><input className="login-input" id="register-email" type="email" name="email" required maxLength={254} autoComplete="email" />
      <label className="login-label" htmlFor="register-password">Password (at least 12 characters)</label><input className="login-input" id="register-password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" />
      <label className="login-label" htmlFor="register-confirm">Confirm password</label><input className="login-input" id="register-confirm" name="confirm" type="password" required autoComplete="new-password" />
      <p>Email verification and email password recovery are not enabled yet. Never send your password to Ask Me.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="login-submit-modern" disabled={pending}>{pending ? "Creating…" : "Register"}</button>
    </form>}
    <p><Link to="/">Back to login</Link></p>
  </section></main>;
}
