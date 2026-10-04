import { useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import useBodyClass from '../hooks/useBodyClass';
import { useLanguage } from '../state/LanguageContext';
import { apiRequest } from '../services/apiClient';
import './ForgotPasswordPage.css';

export default function ForgotPasswordPage() {
  useBodyClass('user-app');
  const { language } = useLanguage();
  const t = (en, zh) => language === 'zh' ? zh : en;
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(null);
  const locked = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (locked.current || done || !consent) return;
    const details = { accountName: accountName.trim(), email: email.trim().toLowerCase(), consent: true };
    if (!details.accountName || !details.email) return;
    if (!attempt.current || JSON.stringify(attempt.current.details) !== JSON.stringify(details))
      attempt.current = { details, clientId: crypto.randomUUID() };
    locked.current = true; setBusy(true); setError('');
    try {
      await apiRequest('/auth/recovery-request', { method: 'POST', body: { ...details, clientId: attempt.current.clientId }, timeoutMs: 15000 });
      setDone(true); setAccountName(''); setEmail('');
    } catch (e) {
      setError(e.code === 'TOO_MANY_REQUESTS' ? t('Too many requests. Please wait a few minutes before trying again.', '申请过于频繁，请稍后再试。')
        : e.code === 'INVALID_RECOVERY' ? t('Check your account name and email. Do not enter passwords or verification codes.', '请检查账户名和邮箱，不要填写密码或验证码。')
          : t('Could not confirm submission. Please retry; retrying the same details will not create a duplicate.', '暂时无法确认是否提交成功，请重试；重试相同信息不会重复创建工单。'));
    } finally { locked.current = false; setBusy(false); }
  }
  return <main className="forgot-modern-shell" data-react-i18n><section className="forgot-modern-card recovery-card">
    <div className="forgot-brand-row"><span className="brand-mark"><ShieldCheck size={20} /></span><span>Study Companion</span></div>
    <div className="forgot-heading"><span className="login-status-pill">{t('Account Recovery', '账号恢复')}</span>
      <h1>{t('Account recovery support', '账号恢复支持')}</h1>
      <p><Link to="/reset-password">{t('Reset password with an email link', '通过邮件链接重置密码')}</Link></p>
      <p>{t('Enter your account name and linked email to request help from the support team.', '填写你的账户名和绑定邮箱，向管理员申请账号恢复。')}</p>
    </div>
    {done ? <div className="recovery-success" role="status"><CheckCircle2 size={26}/><h2>{t('Recovery request received', '已收到恢复申请')}</h2>
      <p>{t('Your request is in the support review queue. This does not confirm whether an account exists. Repeated requests may be combined.', '申请已进入客服审核队列。此提示不代表已确认该账户存在，重复申请可能合并处理。')}</p>
      <p>{t('No password has been changed and no email has been sent by this support request. Use the email reset link above for self-service recovery.', '此支持申请不会修改密码或发送重置邮件。自助恢复请使用上方的邮件重置链接。')}</p>
    </div> : <form className="recovery-form" onSubmit={submit}>
      <label htmlFor="recovery-name">{t('Account name', '账户名')}<input id="recovery-name" name="accountName" autoComplete="username" required maxLength={80} disabled={busy} value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder={t('Name used for your account', '填写账号使用的姓名或用户名')}/></label>
      <label htmlFor="recovery-email">{t('Linked email', '绑定邮箱')}<input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
      <div className="recovery-info"><Mail size={18}/><p>{t('This submits a support ticket. Never include passwords, verification codes or API keys.', '此操作会提交支持工单。请勿填写密码、验证码或 API Key。')}</p></div>
      <label className="recovery-consent"><input type="checkbox" checked={consent} required disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>{t('I agree to share this account name and email with support administrators for account recovery.', '我同意将上述账户名和邮箱交给支持管理员，用于处理账号恢复申请。')}</span></label>
      {error && <p className="recovery-error" role="alert">{error}</p>}
      <button className="recovery-submit" disabled={busy || !consent}>{busy ? t('Submitting…', '提交中…') : t('Submit recovery request', '提交恢复申请')}</button>
    </form>}
    <p className="recovery-google">{t('Signed up with Google? Use Google sign-in. Manage your Google password through Google, not this form.', '使用 Google 注册？请使用 Google 登录。Google 密码由 Google 管理，不能通过此表单修改。')}</p>
    <Link className="forgot-back-link" to="/"><ArrowLeft size={16}/>{t('Back to login', '返回登录')}</Link>
  </section></main>;
}
