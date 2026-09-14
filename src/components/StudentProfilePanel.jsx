import { Bell, Check, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import AvatarPicker from "./AvatarPicker";

export default function StudentProfilePanel({
  title = "Your Profile",
  initials = "AC",
  name = "Good Morning, Alex",
  subtitle = "Continue your learning journey and achieve your target.",
  children,
}) {
  const { currentUser } = useAppData();
  return (
    <aside className="user-profile">
      <div className="profile-title"><span>{title}</span><span>...</span></div>
      <div className="profile-card">
        <AvatarPicker initials={initials} />
        <h2>{currentUser?.name || name}</h2>
        <p>{subtitle}</p>
        <Link to="/student/profile">Edit Profile</Link>
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
