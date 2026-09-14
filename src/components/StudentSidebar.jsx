import {
  BookOpenText,
  LayoutDashboard,
  ListChecks,
  Layers,
  LogOut,
  MessageCircleQuestion,
  Settings,
  Sparkles,
  Upload,
  ChevronDown,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import "./StudentSidebar.css";

const links = [
  { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/upload", label: "Upload", icon: Upload },
];
const aiLinks = [
  { mode: "summary", label: "Summary", icon: BookOpenText },
  { mode: "qa", label: "Q&A", icon: MessageCircleQuestion },
  { mode: "quiz", label: "Quiz", icon: ListChecks },
  { mode: "flashcards", label: "Flashcards", icon: Layers },
];

export default function StudentSidebar() {
  const { logout } = useAppData();
  const location = useLocation();
  const currentMode = new URLSearchParams(location.search).get("mode") || "summary";
  const isAI = location.pathname === "/student/workspace" && aiLinks.some((item) => item.mode === currentMode);

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
        <details className={`sidebar-ai-group${isAI ? " active" : ""}`} open={isAI}>
          <summary>
            <span className="nav-icon"><Sparkles size={15} /></span>
            <span>AI Functions</span>
            <ChevronDown className="sidebar-ai-chevron" size={16} aria-hidden="true" />
          </summary>
          <div className="sidebar-ai-links">
            {aiLinks.map(({ mode, label, icon: Icon }) => (
              <Link key={mode} to={`/student/workspace?mode=${mode}`} className={isAI && currentMode === mode ? "active" : ""} aria-current={isAI && currentMode === mode ? "page" : undefined}>
                <span className="nav-icon"><Icon size={15} /></span>{label}
              </Link>
            ))}
          </div>
        </details>
        <NavLink to="/student/history" className={({ isActive }) => isActive ? "active" : ""}><span className="nav-icon"><BookOpenText size={15} /></span>Study History</NavLink>
        <NavLink to="/student/review" className={({ isActive }) => isActive ? "active" : ""}><span className="nav-icon"><ListChecks size={15} /></span>Review Centre</NavLink>
      </nav>
      <div className="sidebar-spacer" />
      <p className="nav-label">Settings</p>
      <div className="sidebar-footer">
        <Link to="/student/profile"><span className="nav-icon"><Settings size={15} /></span>My Profile</Link>
        <NavLink className="logout" to="/" onClick={logout}>
          <span className="nav-icon"><LogOut size={15} /></span>Logout
        </NavLink>
      </div>
    </aside>
  );
}
