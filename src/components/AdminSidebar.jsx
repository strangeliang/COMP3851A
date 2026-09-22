import {
  LogOut,
  ShieldCheck,
  LifeBuoy,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { useLanguage } from "../state/LanguageContext";

const adminLinks = [
  { to: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
];

export default function AdminSidebar() {
  const { logout } = useAppData();
  const { language } = useLanguage();
  const zh = language === 'zh';
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <aside className="admin-sidebar" data-react-i18n>
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <ShieldCheck size={18} />
        </span>
        <div className="admin-brand-copy">
          <strong>Study Companion</strong>
          <span>{zh ? '工单管理端' : 'Support Admin'}</span>
        </div>
      </div>

      <p className="admin-nav-label">{zh ? '学生支持' : 'Student support'}</p>

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
            <span>{zh ? '问题工单' : label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar-spacer" />

      <p className="admin-nav-label">{zh ? '账号' : 'Account'}</p>

      <button
        type="button"
        className="admin-logout-button"
        onClick={handleLogout}
      >
        <span className="admin-nav-icon">
          <LogOut size={16} />
        </span>
        <span>{zh ? '退出登录' : 'Logout'}</span>
      </button>
    </aside>
  );
}
