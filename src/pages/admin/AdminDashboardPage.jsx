import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  HelpCircle,
  Layers3,
  MessageCircleQuestion,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useAppData } from "../../state/AppDataContext";

export default function AdminDashboardPage() {
  const { users, courses, materials, quizAttempts, qaUses, summaryUses, averageQuizScore } =
    useAppData();

  const students = useMemo(
    () => users.filter((user) => user.role === "Student"),
    [users],
  );

  const activeStudents = students.filter((student) => student.status === "Active").length;
  const disabledStudents = students.filter((student) => student.status === "Disabled").length;
  const readyMaterials = materials.filter((material) => material.status === "Ready").length;

  const courseRows = courses.map((course) => {
    const courseMaterials = materials.filter((material) => material.courseId === course.id);
    const owner = users.find((user) => user.id === course.ownerId);

    return {
      ...course,
      ownerName: owner?.name || "Unknown Student",
      fileCount: courseMaterials.length,
    };
  });

  const recentActivities = [
    {
      title: "Student account routing",
      detail: "Login redirects students and admins to different dashboards.",
      status: "Ready",
      icon: UsersRound,
    },
    {
      title: "Course material grouping",
      detail: "Uploaded files are grouped under selected study courses.",
      status: "Ready",
      icon: Layers3,
    },
    {
      title: "Q&A review page",
      detail: "Admin can review mock Q&A outputs and change review status.",
      status: "Mock",
      icon: MessageCircleQuestion,
    },
    {
      title: "Quiz records",
      detail: "Quiz attempts appear after a student completes a quiz session.",
      status: quizAttempts.length ? "Active" : "Waiting",
      icon: Activity,
    },
  ];

  return (
    <>
      <style>{`
        .admin-dashboard-page {
          display: grid;
          gap: 22px;
        }

        .admin-dashboard-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 18px;
        }

        .admin-dashboard-title-card,
        .admin-dashboard-side-card,
        .admin-dashboard-stat,
        .admin-dashboard-panel,
        .admin-dashboard-mini-card,
        .admin-dashboard-course-card {
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-dashboard-title-card {
          position: relative;
          overflow: hidden;
          padding: 28px 30px;
          color: #fff;
          background: #6f32ff;
        }

        .admin-dashboard-title-card::after {
          content: "";
          position: absolute;
          right: -54px;
          bottom: -78px;
          width: 235px;
          height: 235px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
        }

        .admin-dashboard-title-card::before {
          content: "";
          position: absolute;
          right: 112px;
          top: 30px;
          width: 72px;
          height: 72px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          transform: rotate(14deg);
        }

        .admin-dashboard-kicker {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 12px;
          color: #ded0ff;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .admin-dashboard-title-card h1 {
          max-width: 680px;
          margin: 0;
          font-size: clamp(30px, 3vw, 44px);
          line-height: 1.05;
          font-weight: 800;
        }

        .admin-dashboard-title-card p {
          max-width: 630px;
          margin: 14px 0 0;
          color: #eee7ff;
          font-size: 14px;
        }

        .admin-dashboard-side-card {
          display: grid;
          align-content: center;
          gap: 14px;
          padding: 22px;
        }

        .admin-dashboard-side-card span {
          color: #77727f;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-dashboard-side-card strong {
          color: #27252d;
          font-size: 36px;
          line-height: 1;
        }

        .admin-dashboard-side-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-dashboard-stat {
          display: flex;
          gap: 12px;
          align-items: center;
          min-height: 78px;
          padding: 16px;
        }

        .admin-dashboard-stat-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-dashboard-stat span,
        .admin-dashboard-stat strong {
          display: block;
        }

        .admin-dashboard-stat span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-stat strong {
          margin-top: 2px;
          color: #27252d;
          font-size: 20px;
        }

        .admin-dashboard-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 330px;
          gap: 18px;
          align-items: start;
        }

        .admin-dashboard-panel {
          padding: 22px;
        }

        .admin-dashboard-panel-heading {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }

        .admin-dashboard-panel-heading h2,
        .admin-dashboard-course-section h2 {
          margin: 0;
          color: #27252d;
          font-size: 20px;
        }

        .admin-dashboard-panel-heading p,
        .admin-dashboard-course-section p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-activity-list {
          display: grid;
          gap: 12px;
        }

        .admin-dashboard-activity-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 15px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
        }

        .admin-dashboard-activity-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-dashboard-activity-row h3 {
          margin: 0;
          color: #27252d;
          font-size: 14px;
        }

        .admin-dashboard-activity-row p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-pill {
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

        .admin-dashboard-pill.ready,
        .admin-dashboard-pill.active {
          color: #1d7a43;
          background: #effaf2;
        }

        .admin-dashboard-pill.waiting,
        .admin-dashboard-pill.mock {
          color: #9b6819;
          background: #fff3d8;
        }

        .admin-dashboard-right-stack {
          display: grid;
          gap: 18px;
        }

        .admin-dashboard-mini-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .admin-dashboard-mini-card {
          padding: 18px;
        }

        .admin-dashboard-mini-card span,
        .admin-dashboard-mini-card strong {
          display: block;
        }

        .admin-dashboard-mini-card span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-mini-card strong {
          margin-top: 8px;
          color: #27252d;
          font-size: 26px;
        }

        .admin-dashboard-alert {
          display: grid;
          gap: 12px;
          padding: 18px;
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-dashboard-alert-icon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-dashboard-alert h3 {
          margin: 0;
          color: #27252d;
          font-size: 16px;
        }

        .admin-dashboard-alert p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-course-section {
          display: grid;
          gap: 14px;
        }

        .admin-dashboard-course-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-dashboard-course-card {
          padding: 18px;
        }

        .admin-dashboard-course-card h3 {
          margin: 0;
          color: #27252d;
          font-size: 16px;
        }

        .admin-dashboard-course-card p {
          margin: 8px 0 13px;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-course-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #77727f;
          font-size: 12px;
        }

        .admin-dashboard-progress {
          overflow: hidden;
          height: 8px;
          margin-top: 14px;
          border-radius: 999px;
          background: #eee7ff;
        }

        .admin-dashboard-progress span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #6f32ff;
        }

        @media (max-width: 1100px) {
          .admin-dashboard-hero,
          .admin-dashboard-main-grid {
            grid-template-columns: 1fr;
          }

          .admin-dashboard-stat-grid,
          .admin-dashboard-course-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .admin-dashboard-stat-grid,
          .admin-dashboard-course-grid,
          .admin-dashboard-mini-grid,
          .admin-dashboard-activity-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <AdminLayout>
        <section className="admin-dashboard-page">
          <div className="admin-dashboard-hero">
            <div className="admin-dashboard-title-card">
              <p className="admin-dashboard-kicker">
                <BarChart3 size={16} /> Admin Overview
              </p>
              <h1>Study Companion Admin Dashboard</h1>
              <p>
                A simple control centre for reviewing students, uploaded study
                materials, AI study outputs, and demo learning activity.
              </p>
            </div>

            <div className="admin-dashboard-side-card">
              <span>Average Quiz Score</span>
              <strong>{averageQuizScore}%</strong>
              <p>Updates after student quiz submissions in the demo session.</p>
            </div>
          </div>

          <div className="admin-dashboard-stat-grid">
            <div className="admin-dashboard-stat">
              <span className="admin-dashboard-stat-icon">
                <UsersRound size={18} />
              </span>
              <div>
                <span>Students</span>
                <strong>{students.length}</strong>
              </div>
            </div>

            <div className="admin-dashboard-stat">
              <span className="admin-dashboard-stat-icon">
                <BookOpen size={18} />
              </span>
              <div>
                <span>Courses</span>
                <strong>{courses.length}</strong>
              </div>
            </div>

            <div className="admin-dashboard-stat">
              <span className="admin-dashboard-stat-icon">
                <FileText size={18} />
              </span>
              <div>
                <span>Materials</span>
                <strong>{materials.length}</strong>
              </div>
            </div>

            <div className="admin-dashboard-stat">
              <span className="admin-dashboard-stat-icon">
                <Activity size={18} />
              </span>
              <div>
                <span>Quiz Records</span>
                <strong>{quizAttempts.length}</strong>
              </div>
            </div>
          </div>

          <div className="admin-dashboard-main-grid">
            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel-heading">
                <div>
                  <h2>Recent Demo Activity</h2>
                  <p>Important prototype functions and their current state.</p>
                </div>
                <Clock3 size={19} color="#6f32ff" />
              </div>

              <div className="admin-dashboard-activity-list">
                {recentActivities.map((activity) => {
                  const Icon = activity.icon;

                  return (
                    <article className="admin-dashboard-activity-row" key={activity.title}>
                      <span className="admin-dashboard-activity-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3>{activity.title}</h3>
                        <p>{activity.detail}</p>
                      </div>
                      <span className={`admin-dashboard-pill ${activity.status.toLowerCase()}`}>
                        {activity.status}
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="admin-dashboard-right-stack">
              <div className="admin-dashboard-mini-grid">
                <div className="admin-dashboard-mini-card">
                  <span>Active Students</span>
                  <strong>{activeStudents}</strong>
                </div>
                <div className="admin-dashboard-mini-card">
                  <span>Disabled</span>
                  <strong>{disabledStudents}</strong>
                </div>
                <div className="admin-dashboard-mini-card">
                  <span>Ready Files</span>
                  <strong>{readyMaterials}</strong>
                </div>
                <div className="admin-dashboard-mini-card">
                  <span>Q&amp;A Uses</span>
                  <strong>{qaUses}</strong>
                </div>
              </div>

              <div className="admin-dashboard-alert">
                <span className="admin-dashboard-alert-icon">
                  <AlertCircle size={19} />
                </span>
                <div>
                  <h3>Prototype Note</h3>
                  <p>
                    This admin dashboard uses local mock data. Real database and
                    API connection can be added later without changing the page layout.
                  </p>
                </div>
              </div>

              <div className="admin-dashboard-alert">
                <span className="admin-dashboard-alert-icon">
                  <HelpCircle size={19} />
                </span>
                <div>
                  <h3>Study Tool Usage</h3>
                  <p>
                    Summary used {summaryUses} time(s), and Q&amp;A used {qaUses}
                    time(s) in this browser session.
                  </p>
                </div>
              </div>
            </aside>
          </div>

          <section className="admin-dashboard-course-section">
            <div>
              <h2>Course Overview</h2>
              <p>Quick check of course groups and their uploaded study files.</p>
            </div>

            <div className="admin-dashboard-course-grid">
              {courseRows.map((course) => {
                const progress = Math.min(100, course.fileCount * 20);

                return (
                  <article className="admin-dashboard-course-card" key={course.id}>
                    <h3>{course.code}</h3>
                    <p>{course.name}</p>
                    <div className="admin-dashboard-course-footer">
                      <span>{course.ownerName}</span>
                      <span>
                        <CheckCircle2 size={13} /> {course.fileCount} file(s)
                      </span>
                    </div>
                    <div className="admin-dashboard-progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </AdminLayout>
    </>
  );
}
