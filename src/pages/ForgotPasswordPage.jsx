import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import useBodyClass from "../hooks/useBodyClass";

export default function ForgotPasswordPage() {
  useBodyClass("user-app");

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setSubmitted(true);
  }

  return (
    <main className="forgot-modern-shell">
      <section className="forgot-modern-card">
        <div className="forgot-brand-row">
          <span className="brand-mark">
            <ShieldCheck size={20} />
          </span>
          <span>Study Companion</span>
        </div>

        {!submitted ? (
          <>
            <div className="forgot-icon">
              <Mail size={30} />
            </div>

            <div className="forgot-heading">
              <span className="login-status-pill">Account Recovery</span>
              <h1>Reset your password</h1>
              <p>
                Enter your registered email address. If the account exists,
                password reset instructions will be prepared for you.
              </p>
            </div>

            <form className="forgot-form" onSubmit={submit}>
              <label className="login-label" htmlFor="reset-email">
                Email
              </label>

              <input
                id="reset-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
              />

              {error && <p className="form-error">{error}</p>}

              <button className="login-submit-modern" type="submit">
                Continue
              </button>
            </form>
          </>
        ) : (
          <div className="forgot-success">
            <div className="forgot-icon success">
              <CheckCircle2 size={34} />
            </div>

            <h1>Request received</h1>

            <p>
              If this email is registered, password reset instructions will be
              sent to the account email address.
            </p>

            <Link className="forgot-back-button" to="/">
              Return to login
            </Link>
          </div>
        )}

        {!submitted && (
  <Link className="forgot-back-link" to="/">
    <ArrowLeft size={16} />
    Back to login
  </Link>
)}
      </section>
    </main>
  );
}