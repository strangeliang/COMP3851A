import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import useBodyClass from "../hooks/useBodyClass";

export default function ForgotPasswordPage() {
  useBodyClass("user-app");
  return <main className="forgot-modern-shell"><section className="forgot-modern-card">
    <div className="forgot-brand-row"><span className="brand-mark"><ShieldCheck size={20} /></span><span>Study Companion</span></div>
    <div className="forgot-heading"><span className="login-status-pill">Account Recovery</span><h1>Need help signing in?</h1>
      <p>Automatic password reset is not available in this version. Please contact your course administrator for account assistance.</p>
    </div>
    <Link className="forgot-back-link" to="/"><ArrowLeft size={16} />Back to login</Link>
  </section></main>;
}
