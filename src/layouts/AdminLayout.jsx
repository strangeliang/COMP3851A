import AdminSidebar from "../components/AdminSidebar";
import useBodyClass from "../hooks/useBodyClass";
import { useAppData } from "../state/AppDataContext";

export default function AdminLayout({ children }) {
  useBodyClass("admin-shell");
  const { currentUser } = useAppData();

  const displayName = currentUser?.name || "Admin User";
  const displayRole = currentUser?.role || "Admin";
  const displayEmail = currentUser?.email || "admin@example.com";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="page-shell">
      <section className="screen app-screen admin-app-shell">
        <AdminSidebar />

        <section className="admin-main-area">
          <header className="admin-topbar">
            <div className="admin-topbar-user">
              <div className="admin-topbar-meta">
                <span className="admin-topbar-label">Signed in as</span>
                <strong>{displayName}</strong>
                <small>
                  {displayEmail} · {displayRole}
                </small>
              </div>

              <span className="admin-topbar-avatar">{initials}</span>
            </div>
          </header>

          <section className="main-content">{children}</section>
        </section>
      </section>
    </main>
  );
}