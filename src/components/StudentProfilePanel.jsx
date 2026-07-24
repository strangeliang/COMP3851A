import { Bell, Check, Mail } from "lucide-react";

export default function StudentProfilePanel({
  title = "Your Profile",
  initials = "AC",
  name = "Good Morning, Alex",
  subtitle = "Continue your learning journey and achieve your target.",
  children,
}) {
  return (
    <aside className="user-profile">
      <div className="profile-title"><span>{title}</span><span>...</span></div>
      <div className="profile-card">
        <div className="profile-photo">{initials}</div>
        <h2>{name}</h2>
        <p>{subtitle}</p>
        <div className="profile-actions">
          <span><Bell size={16} /></span>
          <span><Mail size={16} /></span>
          <span><Check size={16} /></span>
        </div>
      </div>
      {children}
    </aside>
  );
}
