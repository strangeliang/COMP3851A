import {
  CircleOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
  ShieldEllipsis,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useAppData } from "../../state/AppDataContext";

export default function AdminAccountsPage() {
  const { users, currentUser, toggleUserStatus } = useAppData();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All");
  const [status, setStatus] = useState("All");
  const [selectedId, setSelectedId] = useState(currentUser?.id || users[0]?.id || "");

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const text = `${user.name} ${user.email} ${user.role} ${user.status}`.toLowerCase();

      return (
        (role === "All" || user.role === role) &&
        (status === "All" || user.status === status) &&
        (!query || text.includes(query))
      );
    });
  }, [role, search, status, users]);

  const selectedUser =
    users.find((user) => String(user.id) === String(selectedId)) || visibleUsers[0] || users[0];

  const adminCount = users.filter((user) => user.role === "Admin").length;
  const activeCount = users.filter((user) => user.status === "Active").length;
  const disabledCount = users.filter((user) => user.status === "Disabled").length;

  const permissionRows = [
    {
      role: "Admin",
      access: "Dashboard, Students, Materials, Q&A Review, Login Access",
      level: "Full management access",
    },
    {
      role: "Student",
      access: "Dashboard, Upload, Q&A, Quiz, Profile",
      level: "Learning access only",
    },
  ];

  const demoAccounts = [
    {
      title: "Admin Test Account",
      email: "admin@example.com",
      password: "admin123",
      role: "Admin",
      icon: ShieldCheck,
    },
    {
      title: "Student Test Account",
      email: "student@example.com",
      password: "student123",
      role: "Student",
      icon: UserRound,
    },
  ];

  return (
    <>
      <style>{`
        .admin-access-page {
          display: grid;
          gap: 22px;
        }

        .admin-access-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 18px;
        }

        .admin-access-title-card,
        .admin-access-side-card,
        .admin-access-stat,
        .admin-access-panel,
        .admin-access-detail,
        .admin-access-login-card,
        .admin-access-permission-card,
        .admin-access-note-card {
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-access-title-card {
          position: relative;
          overflow: hidden;
          padding: 28px 30px;
          color: #fff;
          background: #6f32ff;
        }

        .admin-access-title-card::after {
          content: "";
          position: absolute;
          right: -54px;
          bottom: -78px;
          width: 235px;
          height: 235px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
        }

        .admin-access-kicker {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 12px;
          color: #ded0ff;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .admin-access-title-card h1 {
          max-width: 680px;
          margin: 0;
          font-size: clamp(30px, 3vw, 44px);
          line-height: 1.05;
          font-weight: 800;
        }

        .admin-access-title-card p {
          max-width: 630px;
          margin: 14px 0 0;
          color: #eee7ff;
          font-size: 14px;
        }

        .admin-access-side-card {
          display: grid;
          align-content: center;
          gap: 14px;
          padding: 22px;
        }

        .admin-access-side-card span {
          color: #77727f;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-access-side-card strong {
          color: #27252d;
          font-size: 36px;
          line-height: 1;
        }

        .admin-access-side-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-access-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-access-stat {
          display: flex;
          gap: 12px;
          align-items: center;
          min-height: 78px;
          padding: 16px;
        }

        .admin-access-stat-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-access-stat span,
        .admin-access-stat strong {
          display: block;
        }

        .admin-access-stat span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-access-stat strong {
          margin-top: 2px;
          color: #27252d;
          font-size: 20px;
        }

        .admin-access-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 315px;
          gap: 18px;
          align-items: start;
        }

        .admin-access-panel,
        .admin-access-detail {
          padding: 22px;
        }

        .admin-access-panel-heading {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }

        .admin-access-panel-heading h2,
        .admin-access-detail h2,
        .admin-access-section h2 {
          margin: 0;
          color: #27252d;
          font-size: 20px;
        }

        .admin-access-panel-heading p,
        .admin-access-detail p,
        .admin-access-section p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-access-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 135px 150px;
          gap: 12px;
          margin-bottom: 16px;
        }

        .admin-access-search {
          display: flex;
          gap: 10px;
          align-items: center;
          min-height: 46px;
          padding: 0 14px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          background: #fcfcfe;
        }

        .admin-access-search input {
          width: 100%;
          min-height: 40px;
          padding: 0;
          border: 0;
          outline: 0;
          background: transparent;
        }

        .admin-access-tools select {
          min-height: 46px;
          padding: 0 12px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          color: #27252d;
          background: #fcfcfe;
        }

        .admin-access-list {
          display: grid;
          gap: 12px;
        }

        .admin-access-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 15px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
        }

        .admin-access-row.active {
          border-color: rgba(111, 50, 255, 0.42);
          background: #f7f3ff;
        }

        .admin-access-profile-line {
          display: flex;
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        .admin-access-avatar {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          color: #fff;
          background: #6f32ff;
          font-weight: 800;
        }

        .admin-access-name {
          margin: 0;
          overflow: hidden;
          color: #27252d;
          font-size: 14px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-access-subtext {
          display: flex;
          gap: 6px;
          align-items: center;
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-access-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 9px;
        }

        .admin-access-pill {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 4px 9px;
          border-radius: 999px;
          color: #6f32ff;
          background: #eee7ff;
          font-size: 11px;
          font-weight: 700;
        }

        .admin-access-pill.active {
          color: #1d7a43;
          background: #effaf2;
        }

        .admin-access-pill.disabled {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-access-view-button,
        .admin-access-action-button {
          min-height: 36px;
          padding: 8px 15px;
          border: 0;
          border-radius: 8px;
          color: #fff;
          background: #6f32ff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .admin-access-detail-card {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .admin-access-detail-block {
          padding: 14px;
          border-radius: 12px;
          background: #f7f3ff;
        }

        .admin-access-detail-block strong {
          display: block;
          margin-bottom: 6px;
          color: #6f32ff;
          font-size: 12px;
          text-transform: uppercase;
        }

        .admin-access-detail-block span {
          color: #4d4855;
          font-size: 13px;
        }

        .admin-access-action-button.secondary {
          width: 100%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-access-action-button.danger {
          width: 100%;
          color: #be2640;
          background: #fff3f5;
        }

        .admin-access-empty {
          padding: 28px;
          border: 1px dashed #d9cdf7;
          border-radius: 14px;
          color: #77727f;
          text-align: center;
          background: #fcfcfe;
          font-size: 13px;
        }

        .admin-access-section {
          display: grid;
          gap: 14px;
        }

        .admin-access-login-grid,
        .admin-access-permission-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-access-login-card,
        .admin-access-permission-card,
        .admin-access-note-card {
          padding: 20px;
        }

        .admin-access-login-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 14px;
        }

        .admin-access-login-top h3,
        .admin-access-permission-card h3,
        .admin-access-note-card h3 {
          margin: 0;
          color: #27252d;
          font-size: 17px;
        }

        .admin-access-login-icon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-access-login-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #f7f3ff;
          color: #4d4855;
          font-size: 13px;
        }

        .admin-access-login-line + .admin-access-login-line {
          margin-top: 10px;
        }

        .admin-access-login-line strong {
          color: #6f32ff;
          font-size: 12px;
        }

        .admin-access-permission-card p,
        .admin-access-note-card p {
          margin: 8px 0 0;
          color: #77727f;
          font-size: 12px;
          line-height: 1.6;
        }

        @media (max-width: 1100px) {
          .admin-access-hero,
          .admin-access-main-grid {
            grid-template-columns: 1fr;
          }

          .admin-access-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .admin-access-stat-grid,
          .admin-access-tools,
          .admin-access-row,
          .admin-access-login-grid,
          .admin-access-permission-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <AdminLayout>
        <section className="admin-access-page">
          <div className="admin-access-hero">
            <div className="admin-access-title-card">
              <p className="admin-access-kicker">
                <KeyRound size={16} /> Login Access
              </p>
              <h1>Account Permission Control</h1>
              <p>
                Manage account role, login status, and access level. This page is
                separated from student learning information for clearer privacy control.
              </p>
            </div>

            <div className="admin-access-side-card">
              <span>Current Login</span>
              <strong>{currentUser?.role || "Guest"}</strong>
              <p>{currentUser?.email || "No account is currently signed in."}</p>
            </div>
          </div>

          <div className="admin-access-stat-grid">
            <div className="admin-access-stat">
              <span className="admin-access-stat-icon">
                <UsersRound size={18} />
              </span>
              <div>
                <span>Total Accounts</span>
                <strong>{users.length}</strong>
              </div>
            </div>

            <div className="admin-access-stat">
              <span className="admin-access-stat-icon">
                <ShieldCheck size={18} />
              </span>
              <div>
                <span>Admin Roles</span>
                <strong>{adminCount}</strong>
              </div>
            </div>

            <div className="admin-access-stat">
              <span className="admin-access-stat-icon">
                <UserCheck size={18} />
              </span>
              <div>
                <span>Active</span>
                <strong>{activeCount}</strong>
              </div>
            </div>

            <div className="admin-access-stat">
              <span className="admin-access-stat-icon">
                <CircleOff size={18} />
              </span>
              <div>
                <span>Disabled</span>
                <strong>{disabledCount}</strong>
              </div>
            </div>
          </div>

          <div className="admin-access-main-grid">
            <section className="admin-access-panel">
              <div className="admin-access-panel-heading">
                <div>
                  <h2>Access Accounts</h2>
                  <p>Search accounts and control login availability.</p>
                </div>
                <ShieldEllipsis size={19} color="#6f32ff" />
              </div>

              <div className="admin-access-tools">
                <label className="admin-access-search">
                  <Search size={17} color="#77727f" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search account, email, role, or status..."
                  />
                </label>

                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option>All</option>
                  <option>Admin</option>
                  <option>Student</option>
                </select>

                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Active</option>
                  <option>Disabled</option>
                </select>
              </div>

              <div className="admin-access-list">
                {visibleUsers.map((user) => {
                  const active = String(selectedUser?.id) === String(user.id);
                  const isCurrentUser = String(currentUser?.id) === String(user.id);

                  return (
                    <article
                      className={`admin-access-row${active ? " active" : ""}`}
                      key={user.id}
                    >
                      <div>
                        <div className="admin-access-profile-line">
                          <span className="admin-access-avatar">
                            {user.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <p className="admin-access-name">{user.name}</p>
                            <p className="admin-access-subtext">
                              <Mail size={13} /> {user.email}
                            </p>
                          </div>
                        </div>

                        <div className="admin-access-meta">
                          <span className="admin-access-pill">{user.role}</span>
                          <span className={`admin-access-pill ${user.status.toLowerCase()}`}>
                            {user.status}
                          </span>
                          {isCurrentUser && <span className="admin-access-pill">Current</span>}
                        </div>
                      </div>

                      <button
                        className="admin-access-view-button"
                        type="button"
                        onClick={() => setSelectedId(user.id)}
                      >
                        Manage
                      </button>
                    </article>
                  );
                })}

                {!visibleUsers.length && (
                  <div className="admin-access-empty">
                    No accounts match the current search.
                  </div>
                )}
              </div>
            </section>

            <aside className="admin-access-detail">
              <h2>Access Details</h2>
              <p>Role and login control only. Learning data is not shown here.</p>

              {selectedUser ? (
                <div className="admin-access-detail-card">
                  <div className="admin-access-detail-block">
                    <strong>Account</strong>
                    <span>{selectedUser.name}</span>
                  </div>

                  <div className="admin-access-detail-block">
                    <strong>Email</strong>
                    <span>{selectedUser.email}</span>
                  </div>

                  <div className="admin-access-detail-block">
                    <strong>Role</strong>
                    <span>{selectedUser.role}</span>
                  </div>

                  <div className="admin-access-detail-block">
                    <strong>Login Status</strong>
                    <span>{selectedUser.status}</span>
                  </div>

                  <div className="admin-access-detail-block">
                    <strong>Permission Level</strong>
                    <span>
                      {selectedUser.role === "Admin"
                        ? "Full management access"
                        : "Learning access only"}
                    </span>
                  </div>

                  <button
                    className={`admin-access-action-button ${
                      selectedUser.status === "Active" ? "danger" : "secondary"
                    }`}
                    type="button"
                    onClick={() => toggleUserStatus(selectedUser.id)}
                  >
                    {selectedUser.status === "Active" ? "Disable Login" : "Enable Login"}
                  </button>
                </div>
              ) : (
                <div className="admin-access-empty">
                  Select one account to manage access.
                </div>
              )}
            </aside>
          </div>

          <section className="admin-access-section">
            <div>
              <h2>Role Permission Matrix</h2>
              <p>Simple role-based access control for the current prototype.</p>
            </div>

            <div className="admin-access-permission-grid">
              {permissionRows.map((row) => (
                <article className="admin-access-permission-card" key={row.role}>
                  <h3>{row.role}</h3>
                  <p>{row.level}</p>
                  <p>{row.access}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-access-section">
            <div>
              <h2>Fixed Demo Login Accounts</h2>
              <p>These accounts are only for local testing and presentation.</p>
            </div>

            <div className="admin-access-login-grid">
              {demoAccounts.map((account) => {
                const Icon = account.icon;

                return (
                  <article className="admin-access-login-card" key={account.title}>
                    <div className="admin-access-login-top">
                      <h3>{account.title}</h3>
                      <span className="admin-access-login-icon">
                        <Icon size={18} />
                      </span>
                    </div>

                    <div className="admin-access-login-line">
                      <strong>Email</strong>
                      <span>{account.email}</span>
                    </div>

                    <div className="admin-access-login-line">
                      <strong>Password</strong>
                      <span>{account.password}</span>
                    </div>

                    <div className="admin-access-login-line">
                      <strong>Role</strong>
                      <span>{account.role}</span>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="admin-access-note-card">
              <h3>
                <LockKeyhole size={17} color="#6f32ff" /> Security Note
              </h3>
              <p>
                In a real system, passwords should never be displayed in the admin
                interface. This page only shows demo credentials because the current
                project is a local prototype.
              </p>
            </div>
          </section>
        </section>
      </AdminLayout>
    </>
  );
}
