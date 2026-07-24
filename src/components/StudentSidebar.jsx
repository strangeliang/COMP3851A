import {
  BookOpenText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageCircleQuestion,
  Settings,
  Sparkles,
  Upload,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";

const links = [
  { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/upload", label: "Upload", icon: Upload },
  { to: "/student/workspace?mode=summary", label: "Summary", icon: BookOpenText },
  { to: "/student/workspace?mode=qa", label: "Q&A", icon: MessageCircleQuestion },
  { to: "/student/workspace?mode=quiz", label: "Quiz", icon: ListChecks },
];

export default function StudentSidebar() {
  const { logout } = useAppData();
  const location = useLocation();

  function isWorkspaceLink(to) {
    const [path, query = ""] = to.split("?");
    const mode = new URLSearchParams(query).get("mode");
    return location.pathname === path && location.search.includes(`mode=${mode}`);
  }

  return (
    <aside className="user-sidebar">
      <div className="user-brand">
        <span className="brand-mark"><Sparkles size={20} /></span>
        <span>STUDY AI</span>
      </div>
      <p className="nav-label">Overview</p>
      <nav className="user-nav">
        {links.map(({ to, label, icon: Icon }) => (
          to.startsWith("/student/workspace") ? (
            <Link key={to} to={to} className={isWorkspaceLink(to) ? "active" : ""}>
              <span className="nav-icon"><Icon size={15} /></span>
              {label}
            </Link>
          ) : (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="nav-icon"><Icon size={15} /></span>
              {label}
            </NavLink>
          )
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <p className="nav-label">Settings</p>
      <div className="sidebar-footer">
        <a href="#settings"><span className="nav-icon"><Settings size={15} /></span>Settings</a>
        <NavLink className="logout" to="/" onClick={logout}>
          <span className="nav-icon"><LogOut size={15} /></span>Logout
        </NavLink>
      </div>
    </aside>
  );
}
