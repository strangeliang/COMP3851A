import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/apiClient';
import useBodyClass from '../hooks/useBodyClass';
import '../pages/ForgotPasswordPage.css';
import { useLanguage } from '../state/LanguageContext';

export default function EmailAccessPage({ purpose = 'reset' }) {
  useBodyClass('user-app');
  const { language } = useLanguage();
  const t = (en, zh) => language === 'zh' ? zh : en;
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
    if (token && purpose === 'reset' && form.get('password') !== form.get('confirm')) { setError(t('Passwords do not match.', '两次输入的密码不一致。')); return; }
    const email = String(form.get('email') || '').trim().toLowerCase();
    if (!attempt.current || attempt.current.email !== email) attempt.current = { email,clientId:crypto.randomUUID() };
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await apiRequest(`/auth/email/${token ? 'consume' : 'request'}`, { method:'POST', body:token
        ? { token,purpose,...(purpose === 'reset' ? { password:form.get('password') } : {}) }
        : { ...attempt.current,purpose } });
      setDone(t(result.message, purpose === 'reset' && token ? '密码已更新，请使用新密码登录。' : token ? '邮箱已验证。' : '如果存在符合条件的账户，将发送一次性链接。请检查收件箱和垃圾邮件。'));
    } catch(err) { setError(err.message); } finally { locked.current = false; setBusy(false); }
  }
  return <main className="forgot-modern-shell" data-react-i18n><section className="forgot-modern-card recovery-card">
    <h1>{purpose === 'reset' ? t('Reset password', '重置密码') : t('Verify email', '验证邮箱')}</h1>
    {done ? <p role="status">{done}</p> : <form className="recovery-form" onSubmit={submit}>
      {!token ? <><p>{t('Enter the email linked to your account. The link is valid for 15 minutes and can be used once.', '输入账户绑定的邮箱。链接 15 分钟内有效，只能使用一次。')}</p><label>{t('Email', '邮箱')}<input name="email" type="email" required maxLength={254} autoComplete="email" disabled={busy}/></label></>
        : purpose === 'reset' ? <><label>{t('New password', '新密码')}<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={busy}/></label><label>{t('Confirm password', '确认密码')}<input name="confirm" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={busy}/></label></>
          : <p>{t('Confirm that this email address belongs to you.', '确认此邮箱属于你本人。')}</p>}
      {error && <p role="alert" className="recovery-error">{error}</p>}
      <button className="recovery-submit" disabled={busy}>{busy ? t('Please wait…', '请稍候…') : token ? purpose === 'reset' ? t('Set new password', '设置新密码') : t('Verify email', '验证邮箱') : t('Send one-time link', '发送一次性链接')}</button>
    </form>}
    <p><Link to="/">{t('Back to login', '返回登录')}</Link></p>
    <p><a href={purpose === 'reset' ? '/reset-password' : '/verify-email'}>{t('Request a new link', '申请新链接')}</a></p>
    {purpose === 'reset' && <p><Link to="/forgot-password">{t('Contact account support', '联系账户支持')}</Link></p>}
  </section></main>;
}
