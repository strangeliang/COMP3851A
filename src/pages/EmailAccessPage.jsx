import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/apiClient';
import useBodyClass from '../hooks/useBodyClass';
import '../pages/ForgotPasswordPage.css';

export default function EmailAccessPage({ purpose = 'reset' }) {
  useBodyClass('user-app');
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  useEffect(() => { if (token) window.history.replaceState(null, '', window.location.pathname); }, [token]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [done,setDone] = useState('');
  const attempt = useRef(null);
  const locked = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (locked.current) return;
    const form = new FormData(e.currentTarget);
    if (token && purpose === 'reset' && form.get('password') !== form.get('confirm')) { setError('Passwords do not match.'); return; }
    const email = String(form.get('email') || '').trim().toLowerCase();
    if (!attempt.current || attempt.current.email !== email) attempt.current = { email,clientId:crypto.randomUUID() };
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await apiRequest(`/auth/email/${token ? 'consume' : 'request'}`, { method:'POST', body:token
        ? { token,purpose,...(purpose === 'reset' ? { password:form.get('password') } : {}) }
        : { ...attempt.current,purpose } });
      setDone(result.message);
    } catch(err) { setError(err.message); } finally { locked.current = false; setBusy(false); }
  }
  return <main className="forgot-modern-shell"><section className="forgot-modern-card recovery-card">
    <h1>{purpose === 'reset' ? 'Reset password' : 'Verify email'}</h1>
    {done ? <p role="status">{done}</p> : <form className="recovery-form" onSubmit={submit}>
      {!token ? <><p>Enter the email linked to your account. The link is valid for 15 minutes and can be used once.</p><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" disabled={busy}/></label></>
        : purpose === 'reset' ? <><label>New password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={busy}/></label><label>Confirm password<input name="confirm" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={busy}/></label></>
          : <p>Confirm that this email address belongs to you.</p>}
      {error && <p role="alert" className="recovery-error">{error}</p>}
      <button className="recovery-submit" disabled={busy}>{busy ? 'Please wait…' : token ? purpose === 'reset' ? 'Set new password' : 'Verify email' : 'Send one-time link'}</button>
    </form>}
    <p><Link to="/">Back to login</Link></p>
    <p><a href={purpose === 'reset' ? '/reset-password' : '/verify-email'}>Request a new link</a></p>
    {purpose === 'reset' && <p><Link to="/forgot-password">Contact account support</Link></p>}
  </section></main>;
}
