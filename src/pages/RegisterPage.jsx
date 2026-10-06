import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/apiClient";
import useBodyClass from "../hooks/useBodyClass";
import { useLanguage } from "../state/LanguageContext";

export default function RegisterPage() {
  useBodyClass("user-app");
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("password") !== form.get("confirm")) { setError(t("Passwords do not match.", "两次输入的密码不一致。")); return; }
    locked.current = true; setPending(true); setError("");
    try {
      const result = await apiRequest("/auth/register", { method: "POST", body: { name: form.get("name"), email: form.get("email"), password: form.get("password") } });
      setChallenge({ ...result, email: String(form.get("email")).trim() });
      setCooldown(result.resendAfter); element.reset();
    } catch (err) { setError(err.message); }
    finally { locked.current = false; setPending(false); }
  }
  async function verify(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setPending(true); setError("");
    try {
      await apiRequest("/auth/register/verify", { method: "POST", body: { challengeId: challenge.challengeId, code } });
      setDone(true); setChallenge(null); setCode("");
    } catch (err) { setError(err.message); }
    finally { locked.current = false; setPending(false); }
  }
  async function resend() {
    if (locked.current || cooldown > 0) return;
    locked.current = true; setPending(true); setError("");
    try {
      const result = await apiRequest("/auth/register/resend", { method: "POST", body: { challengeId: challenge.challengeId } });
      setChallenge({ ...result, email: challenge.email }); setCode(""); setCooldown(result.resendAfter);
    } catch (err) { setError(err.message); setCooldown(60); }
    finally { locked.current = false; setPending(false); }
  }
  return <main className="login-modern-shell" data-react-i18n><section className="login-form-panel" style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: 20 }}>
    <h1>{t("Create student account", "创建学生账号")}</h1>
    {done ? <p role="status">{t("Email verified. Account created. You can now log in.", "邮箱验证成功，账号已创建，现在可以登录。")}</p> : challenge ? <form className="login-form-modern" onSubmit={verify}>
      <p role="status">{t(`A 6-digit code was sent to ${challenge.email}. Check your inbox and spam folder.`, `6 位验证码已发送至 ${challenge.email}，请检查收件箱和垃圾邮件。`)}</p>
      <p>{t("The code expires in 10 minutes. You have 5 attempts. Your account is created only after verification.", "验证码 10 分钟内有效，最多尝试 5 次。验证成功后才会创建账号。")}</p>
      <label className="login-label" htmlFor="registration-code">{t("Verification code", "邮箱验证码")}</label>
      <input className="login-input" id="registration-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={pending}/>
      <button className="login-submit-modern" disabled={pending || code.length !== 6}>{pending ? t("Please wait…", "请稍候…") : t("Verify email and create account", "验证邮箱并创建账号")}</button>
      <button type="button" disabled={pending || cooldown > 0} onClick={resend}>{cooldown > 0 ? t(`Resend in ${cooldown}s`, `${cooldown} 秒后可重新发送`) : t("Resend code", "重新发送验证码")}</button>
      <button type="button" disabled={pending} onClick={() => { setChallenge(null); setCode(""); setError(""); }}>{t("Use a different email / start again", "更换邮箱／重新开始")}</button>
      <small>{t("Only the newest code works. Never share it with Ask Me or anyone else.", "仅最新验证码有效。请勿向 Ask Me 或他人提供验证码。")}</small>
    </form> : <form className="login-form-modern" onSubmit={submit}>
      <label className="login-label" htmlFor="register-name">{t("Name", "姓名")}</label><input className="login-input" id="register-name" name="name" required maxLength={80} autoComplete="name" disabled={pending}/>
      <label className="login-label" htmlFor="register-email">{t("Email", "邮箱")}</label><input className="login-input" id="register-email" type="email" name="email" required maxLength={254} autoComplete="email" disabled={pending}/>
      <label className="login-label" htmlFor="register-password">{t("Password (at least 12 characters)", "密码（至少 12 位）")}</label><input className="login-input" id="register-password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={pending}/>
      <label className="login-label" htmlFor="register-confirm">{t("Confirm password", "确认密码")}</label><input className="login-input" id="register-confirm" name="confirm" type="password" required autoComplete="new-password" disabled={pending}/>
      <p>{t("Verify your email with a 6-digit code to finish registration. You will then log in with your email and password.", "输入邮件中的 6 位验证码完成注册，之后用邮箱和密码登录。")}</p>
      <button className="login-submit-modern" disabled={pending}>{pending ? t("Sending…", "正在发送…") : t("Send verification code", "发送验证码")}</button>
    </form>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <p><Link to="/">{t("Back to login", "返回登录")}</Link></p>
  </section></main>;
}
