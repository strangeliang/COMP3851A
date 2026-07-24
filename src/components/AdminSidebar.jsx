import {
  BarChart3,
  FileText,
  GraduationCap,
  KeyRound,
  LogOut,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";

const adminLinks = [
  { to: "/admin/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/admin/users", label: "Students", icon: GraduationCap },
  { to: "/admin/materials", label: "Materials", icon: FileText },
  { to: "/admin/ai-outputs", label: "Q&A Activity", icon: MessageCircleQuestion },
  { to: "/admin/accounts", label: "Login Access", icon: KeyRound },
];

export default function AdminSidebar() {
  const { logout } = useAppData();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <ShieldCheck size={18} />
        </span>
        <div className="admin-brand-copy">
          <strong>Study Companion</strong>
          <span>Admin Portal</span>
        </div>
      </div>

      <p className="admin-nav-label">Management</p>

      <nav className="admin-nav">
        {adminLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
          >
            <span className="admin-nav-icon">
              <Icon size={16} />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar-spacer" />

      <p className="admin-nav-label">Account</p>

      <button
        type="button"
        className="admin-logout-button"
        onClick={handleLogout}
      >
        <span className="admin-nav-icon">
          <LogOut size={16} />
        </span>
        <span>Logout</span>
      </button>
    </aside>
  );
}