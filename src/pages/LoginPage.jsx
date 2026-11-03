import {
  Eye,
  EyeOff,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import useBodyClass from "../hooks/useBodyClass";
import GoogleLogin from "../components/GoogleLogin";
import StudyLogo from "../components/StudyLogo";
import { useAppData } from "../state/AppDataContext";
import { useLanguage } from "../state/LanguageContext";
import './LoginPage.css';

export default function LoginPage() {
  useBodyClass("user-app");

  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login, isAuthLoading } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", remember: false });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const returnPath = typeof location.state?.from === 'string' && /^\/student\/support\/(ASK|SESSION)-[a-zA-Z0-9-]+$/.test(location.state.from) ? location.state.from : null;

  if (currentUser?.role === "Student") {
    return <Navigate to={returnPath || '/student/dashboard'} replace />;
  }

  if (currentUser?.role === "Admin") {
    return <Navigate to="/admin/support" replace />;
  }

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function submit(event) {
    event.preventDefault();

    if (isSubmitting || isAuthLoading) return;
    setIsSubmitting(true);
    setError("");
    const result = await login(form.email, form.password, form.remember);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const fallback =
      result.user.role === "Admin" ? "/admin/support" : "/student/dashboard";

    navigate(location.state?.from || fallback, { replace: true });
  }

  return (
    <main className="login-modern-shell login-simple" data-react-i18n>
      <section className="login-modern-card">
        <section className="login-hero-panel">
          <div className="login-brand-row">
            <StudyLogo />
            <span>Study Companion</span>
          </div>

          <div className="login-hero-content">
            <h1>{t('Your space to learn.', '专注学习，从这里开始。')}</h1>
            <p>{t('Turn your course materials into summaries, answers and practice.', '将课程资料整理成总结、问答和练习。')}</p>
          </div>

          <p className="login-hero-footer">{t('Your courses. Your materials. Your progress.', '课程、资料与学习进度，集中管理。')}</p>
        </section>

        <section className="login-form-panel">
          <div className="login-form-heading">
            <h2>{t('Welcome back', '欢迎回来')}</h2>
            <p>{t('Choose how you would like to sign in.', '选择你的登录方式。')}</p>
          </div>
          <GoogleLogin returnPath={returnPath} />
          <div className="login-method-divider"><span>{t('or use email', '或使用邮箱登录')}</span></div>
          <form className="login-form-modern" onSubmit={submit}>
            <label className="login-label" htmlFor="email">
              {t('Email', '邮箱')}
            </label>

            <input
              id="email"
              className="login-input"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
              aria-describedby={error ? "login-error" : undefined}
              value={form.email}
              onChange={updateField}
              placeholder={t('Enter your email', '请输入邮箱')}
            />

            <label className="login-label" htmlFor="password">
              {t('Password', '密码')}
            </label>

            <div className="login-password-field">
              <input
                id="password"
                className="login-input"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                maxLength={128}
                autoComplete="current-password"
                aria-describedby={error ? "login-error" : undefined}
                value={form.password}
                onChange={updateField}
                placeholder={t('Enter your password', '请输入密码')}
              />

              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t("Hide password", "隐藏密码") : t("Show password", "显示密码")}
                aria-pressed={showPassword}
                aria-controls="password"
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>

            <div className="login-options-modern">
              <label className="login-remember">
                <input
                  name="remember"
                  type="checkbox"
                  checked={form.remember}
                  onChange={updateField}
                />
                {t('Remember me', '记住我')}
              </label>

              <Link className="login-forgot-link" to="/reset-password">
                {t('Forgot password?', '忘记密码？')}
              </Link>
            </div>

            {error && <p id="login-error" role="alert" className="form-error">{error}</p>}

            <button className="login-submit-modern" type="submit" disabled={isSubmitting || isAuthLoading}>
              {isAuthLoading ? t('Checking session…', '检查登录状态…') : isSubmitting ? t('Signing in…', '正在登录…') : t('Log In', '登录')}
            </button>

            <p className="login-support-note">
              {t('New here?', '还没有账号？')} <Link to="/register">{t('Register a student account', '注册学生账号')}</Link>
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}
