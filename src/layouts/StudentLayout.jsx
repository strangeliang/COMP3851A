import StudentProfilePanel from "../components/StudentProfilePanel";
import StudentSidebar from "../components/StudentSidebar";
import useBodyClass from "../hooks/useBodyClass";
import HelpAssistant from "../components/HelpAssistant";
import { useAppData } from "../state/AppDataContext";

export default function StudentLayout({ children, profileProps, profileContent }) {
  useBodyClass("user-app");
  const { historySync, pendingStudyCount, refreshStudyHistory } = useAppData();

  return (
    <main className="user-shell">
      <StudentSidebar />
      <section className="user-main">
        {(historySync?.error || pendingStudyCount > 0) && <div className="state-banner" role={historySync?.error ? 'alert' : 'status'}>
          <span>{historySync?.error || `Saving ${pendingStudyCount} study record(s)…`}</span>
          {!historySync?.pending && <button type="button" onClick={refreshStudyHistory}>Retry saving / refresh</button>}
        </div>}
        {children}
      </section>
      <StudentProfilePanel {...profileProps}>{profileContent}</StudentProfilePanel>
      <HelpAssistant />
    </main>
  );
}
