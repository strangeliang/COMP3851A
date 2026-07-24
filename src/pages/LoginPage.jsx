import {
  BookOpenText,
  Eye,
  EyeOff,
  ListChecks,
  MessageCircleQuestion,
  Sparkles,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import useBodyClass from "../hooks/useBodyClass";
import { useAppData } from "../state/AppDataContext";

export default function LoginPage() {
  useBodyClass("user-app");

  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login } = useAppData();

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", remember: false });
  const [error, setError] = useState("");

  if (currentUser?.role === "Student") {
    return <Navigate to="/student/dashboard" replace />;
  }

  if (currentUser?.role === "Admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function submit(event) {
    event.preventDefault();

    const result = login(form.email, form.password);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const fallback =
      result.user.role === "Admin" ? "/admin/dashboard" : "/student/dashboard";

    navigate(location.state?.from || fallback, { replace: true });
  }

  return (
    <main className="login-modern-shell">
      <section className="login-modern-card">
        <section className="login-hero-panel">
          <div className="login-brand-row">
            <span className="brand-mark">
              <Sparkles size={20} />
            </span>
            <span>Study Companion</span>
          </div>

          <div className="login-hero-content">
            <p className="login-kicker">AI Learning Workspace</p>
            <h1>One place for your learning materials</h1>
            <p>
              Sign in to access your courses, uploaded materials, summaries,
              questions, and quizzes in a structured study workspace.
            </p>
          </div>

          <div className="login-feature-grid">
            <div className="login-feature-card">
              <Upload size={18} />
              <span>Upload Materials</span>
            </div>

            <div className="login-feature-card">
              <BookOpenText size={18} />
              <span>Generate Summaries</span>
            </div>

            <div className="login-feature-card">
              <MessageCircleQuestion size={18} />
              <span>Ask Questions</span>
            </div>

            <div className="login-feature-card">
              <ListChecks size={18} />
              <span>Practice Quizzes</span>
            </div>
          </div>

          <div className="login-preview-box">
            <div className="login-preview-row">
              <span>Workspace</span>
              <strong>Course-based</strong>
            </div>

            <div className="login-preview-row">
              <span>Learning Tools</span>
              <strong>Summary, Q&amp;A, Quiz</strong>
            </div>

            <div className="login-preview-row">
              <span>Access</span>
              <strong>Student / Administrator</strong>
            </div>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-heading">
            <span className="login-status-pill">Account Login</span>
            <h2>Welcome back</h2>
            <p>
              Sign in to continue to your Study Companion workspace.
            </p>
          </div>

          <form className="login-form-modern" onSubmit={submit}>
            <label className="login-label" htmlFor="email">
              Email
            </label>

            <input
              id="email"
              className="login-input"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="Enter your email"
            />

            <label className="login-label" htmlFor="password">
              Password
            </label>

            <div className="login-password-field">
              <input
                id="password"
                className="login-input"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={updateField}
                placeholder="Enter your password"
              />

              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label="Show or hide password"
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
                Remember me
              </label>

              <Link className="login-forgot-link" to="/forgot-password">
                Forgot password?
              </Link>
            </div>

            {error && <p className="form-error">{error}</p>}

            <button className="login-submit-modern" type="submit">
              Log In
            </button>

            <p className="login-support-note">
              Need access to an account? Please contact your course administrator.
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}