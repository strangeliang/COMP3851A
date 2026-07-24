import StudentProfilePanel from "../components/StudentProfilePanel";
import StudentSidebar from "../components/StudentSidebar";
import useBodyClass from "../hooks/useBodyClass";

export default function StudentLayout({ children, profileProps, profileContent }) {
  useBodyClass("user-app");

  return (
    <main className="user-shell">
      <StudentSidebar />
      <section className="user-main">{children}</section>
      <StudentProfilePanel {...profileProps}>{profileContent}</StudentProfilePanel>
    </main>
  );
}
