import {
  Activity,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  LockKeyhole,
  Search,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useAppData } from "../../state/AppDataContext";

export default function AdminUsersPage() {
  const { users, courses, materials, quizAttempts } = useAppData();

  const students = useMemo(
    () => users.filter((user) => user.role === "Student"),
    [users],
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [selectedId, setSelectedId] = useState(students[0]?.id || "");

  function maskEmail(email = "") {
    const [name, domain] = email.split("@");
    if (!name || !domain) return "Hidden";
    return `${name.slice(0, 2)}***@${domain}`;
  }

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const text = `${student.name} ${student.status} ${student.role}`.toLowerCase();

      return (
        (status === "All" || student.status === status) &&
        (!query || text.includes(query))
      );
    });
  }, [search, status, students]);

  const selectedStudent =
    students.find((student) => String(student.id) === String(selectedId)) ||
    visibleStudents[0] ||
    students[0];

  const selectedCourses = selectedStudent
    ? courses.filter((course) => course.ownerId === selectedStudent.id)
    : [];

  const selectedMaterials = selectedStudent
    ? materials.filter((material) => material.ownerId === selectedStudent.id)
    : [];

  const selectedQuizAttempts = selectedStudent
    ? quizAttempts.filter((attempt) => attempt.userId === selectedStudent.id)
    : [];

  const activeStudents = students.filter((student) => student.status === "Active").length;
  const disabledStudents = students.filter((student) => student.status === "Disabled").length;

  return (
    <>
      <style>{`
        .admin-students-page {
          display: grid;
          gap: 22px;
        }

        .admin-students-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 18px;
        }

        .admin-students-title-card,
        .admin-students-side-card,
        .admin-students-stat,
        .admin-students-panel,
        .admin-students-detail,
        .admin-students-course-card,
        .admin-students-privacy-card {
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-students-title-card {
          position: relative;
          overflow: hidden;
          padding: 28px 30px;
          color: #fff;
          background: #6f32ff;
        }

        .admin-students-title-card::after {
          content: "";
          position: absolute;
          right: -54px;
          bottom: -78px;
          width: 235px;
          height: 235px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
        }

        .admin-students-kicker {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 12px;
          color: #ded0ff;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .admin-students-title-card h1 {
          max-width: 680px;
          margin: 0;
          font-size: clamp(30px, 3vw, 44px);
          line-height: 1.05;
          font-weight: 800;
        }

        .admin-students-title-card p {
          max-width: 630px;
          margin: 14px 0 0;
          color: #eee7ff;
          font-size: 14px;
        }

        .admin-students-side-card {
          display: grid;
          align-content: center;
          gap: 14px;
          padding: 22px;
        }

        .admin-students-side-card span {
          color: #77727f;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-students-side-card strong {
          color: #27252d;
          font-size: 36px;
          line-height: 1;
        }

        .admin-students-side-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-students-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-students-stat {
          display: flex;
          gap: 12px;
          align-items: center;
          min-height: 78px;
          padding: 16px;
        }

        .admin-students-stat-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-students-stat span,
        .admin-students-stat strong {
          display: block;
        }

        .admin-students-stat span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-students-stat strong {
          margin-top: 2px;
          color: #27252d;
          font-size: 20px;
        }

        .admin-students-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 315px;
          gap: 18px;
          align-items: start;
        }

        .admin-students-panel,
        .admin-students-detail {
          padding: 22px;
        }

        .admin-students-panel-heading {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }

        .admin-students-panel-heading h2,
        .admin-students-detail h2,
        .admin-students-course-section h2 {
          margin: 0;
          color: #27252d;
          font-size: 20px;
        }

        .admin-students-panel-heading p,
        .admin-students-detail p,
        .admin-students-course-section p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-students-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 155px;
          gap: 12px;
          margin-bottom: 16px;
        }

        .admin-students-search {
          display: flex;
          gap: 10px;
          align-items: center;
          min-height: 46px;
          padding: 0 14px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          background: #fcfcfe;
        }

        .admin-students-search input {
          width: 100%;
          min-height: 40px;
          padding: 0;
          border: 0;
          outline: 0;
          background: transparent;
        }

        .admin-students-tools select {
          min-height: 46px;
          padding: 0 12px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          color: #27252d;
          background: #fcfcfe;
        }

        .admin-students-list {
          display: grid;
          gap: 12px;
        }

        .admin-students-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 15px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
        }

        .admin-students-row.active {
          border-color: rgba(111, 50, 255, 0.42);
          background: #f7f3ff;
        }

        .admin-students-profile-line {
          display: flex;
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        .admin-students-avatar {
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

        .admin-students-name {
          margin: 0;
          overflow: hidden;
          color: #27252d;
          font-size: 14px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-students-subtext {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-students-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 9px;
        }

        .admin-students-pill {
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

        .admin-students-pill.active {
          color: #1d7a43;
          background: #effaf2;
        }

        .admin-students-pill.disabled {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-students-view-button {
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

        .admin-students-detail-card {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .admin-students-detail-block {
          padding: 14px;
          border-radius: 12px;
          background: #f7f3ff;
        }

        .admin-students-detail-block strong {
          display: block;
          margin-bottom: 6px;
          color: #6f32ff;
          font-size: 12px;
          text-transform: uppercase;
        }

        .admin-students-detail-block span {
          color: #4d4855;
          font-size: 13px;
        }

        .admin-students-mini-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .admin-students-mini-card {
          padding: 12px;
          border-radius: 12px;
          color: #27252d;
          background: #f7f3ff;
        }

        .admin-students-mini-card span,
        .admin-students-mini-card strong {
          display: block;
        }

        .admin-students-mini-card span {
          color: #77727f;
          font-size: 11px;
        }

        .admin-students-mini-card strong {
          margin-top: 4px;
          font-size: 18px;
        }

        .admin-students-privacy-card {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 18px;
        }

        .admin-students-privacy-card h3 {
          margin: 0 0 6px;
          color: #27252d;
          font-size: 16px;
        }

        .admin-students-privacy-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
          line-height: 1.6;
        }

        .admin-students-empty {
          padding: 28px;
          border: 1px dashed #d9cdf7;
          border-radius: 14px;
          color: #77727f;
          text-align: center;
          background: #fcfcfe;
          font-size: 13px;
        }

        .admin-students-course-section {
          display: grid;
          gap: 14px;
        }

        .admin-students-course-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-students-course-card {
          padding: 18px;
        }

        .admin-students-course-card h3 {
          margin: 0;
          color: #27252d;
          font-size: 16px;
        }

        .admin-students-course-card p {
          margin: 8px 0 12px;
          color: #77727f;
          font-size: 12px;
        }

        .admin-students-course-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #77727f;
          font-size: 12px;
        }

        @media (max-width: 1100px) {
          .admin-students-hero,
          .admin-students-main-grid {
            grid-template-columns: 1fr;
          }

          .admin-students-stat-grid,
          .admin-students-course-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .admin-students-stat-grid,
          .admin-students-tools,
          .admin-students-row,
          .admin-students-course-grid,
          .admin-students-mini-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <AdminLayout>
        <section className="admin-students-page">
          <div className="admin-students-hero">
            <div className="admin-students-title-card">
              <p className="admin-students-kicker">
                <GraduationCap size={16} /> Student Overview
              </p>
              <h1>Student Information Management</h1>
              <p>
                Review basic student learning activity while keeping private account
                information hidden from this page.
              </p>
            </div>

            <div className="admin-students-side-card">
              <span>Student Records</span>
              <strong>{students.length}</strong>
              <p>Only limited student information is displayed here.</p>
            </div>
          </div>

          <div className="admin-students-stat-grid">
            <div className="admin-students-stat">
              <span className="admin-students-stat-icon">
                <UsersRound size={18} />
              </span>
              <div>
                <span>Total Students</span>
                <strong>{students.length}</strong>
              </div>
            </div>

            <div className="admin-students-stat">
              <span className="admin-students-stat-icon">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <span>Active Students</span>
                <strong>{activeStudents}</strong>
              </div>
            </div>

            <div className="admin-students-stat">
              <span className="admin-students-stat-icon">
                <LockKeyhole size={18} />
              </span>
              <div>
                <span>Restricted</span>
                <strong>{disabledStudents}</strong>
              </div>
            </div>

            <div className="admin-students-stat">
              <span className="admin-students-stat-icon">
                <Activity size={18} />
              </span>
              <div>
                <span>Quiz Attempts</span>
                <strong>{quizAttempts.length}</strong>
              </div>
            </div>
          </div>

          <div className="admin-students-main-grid">
            <section className="admin-students-panel">
              <div className="admin-students-panel-heading">
                <div>
                  <h2>Student List</h2>
                  <p>Search by student name or learning status.</p>
                </div>
                <ShieldAlert size={19} color="#6f32ff" />
              </div>

              <div className="admin-students-tools">
                <label className="admin-students-search">
                  <Search size={17} color="#77727f" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search student name or status..."
                  />
                </label>

                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Active</option>
                  <option>Disabled</option>
                </select>
              </div>

              <div className="admin-students-list">
                {visibleStudents.map((student) => {
                  const studentCourses = courses.filter(
                    (course) => course.ownerId === student.id,
                  );
                  const studentMaterials = materials.filter(
                    (material) => material.ownerId === student.id,
                  );
                  const active = String(selectedStudent?.id) === String(student.id);

                  return (
                    <article
                      className={`admin-students-row${active ? " active" : ""}`}
                      key={student.id}
                    >
                      <div>
                        <div className="admin-students-profile-line">
                          <span className="admin-students-avatar">
                            {student.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <p className="admin-students-name">{student.name}</p>
                            <p className="admin-students-subtext">
                              {maskEmail(student.email)} · Student ID: STU-{student.id}
                            </p>
                          </div>
                        </div>

                        <div className="admin-students-meta">
                          <span className={`admin-students-pill ${student.status.toLowerCase()}`}>
                            {student.status}
                          </span>
                          <span className="admin-students-pill">
                            {studentCourses.length} course(s)
                          </span>
                          <span className="admin-students-pill">
                            {studentMaterials.length} file(s)
                          </span>
                        </div>
                      </div>

                      <button
                        className="admin-students-view-button"
                        type="button"
                        onClick={() => setSelectedId(student.id)}
                      >
                        View
                      </button>
                    </article>
                  );
                })}

                {!visibleStudents.length && (
                  <div className="admin-students-empty">
                    No student records match the current search.
                  </div>
                )}
              </div>
            </section>

            <aside className="admin-students-detail">
              <h2>Learning Summary</h2>
              <p>Only learning-related information is shown here.</p>

              {selectedStudent ? (
                <div className="admin-students-detail-card">
                  <div className="admin-students-detail-block">
                    <strong>Student</strong>
                    <span>
                      <UserRound size={14} /> {selectedStudent.name}
                    </span>
                  </div>

                  <div className="admin-students-detail-block">
                    <strong>Private Contact</strong>
                    <span>{maskEmail(selectedStudent.email)}</span>
                  </div>

                  <div className="admin-students-detail-block">
                    <strong>Status</strong>
                    <span>{selectedStudent.status}</span>
                  </div>

                  <div className="admin-students-mini-grid">
                    <div className="admin-students-mini-card">
                      <span>Courses</span>
                      <strong>{selectedCourses.length}</strong>
                    </div>
                    <div className="admin-students-mini-card">
                      <span>Files</span>
                      <strong>{selectedMaterials.length}</strong>
                    </div>
                    <div className="admin-students-mini-card">
                      <span>Quiz</span>
                      <strong>{selectedQuizAttempts.length}</strong>
                    </div>
                  </div>

                  <div className="admin-students-privacy-card">
                    <LockKeyhole size={19} color="#6f32ff" />
                    <div>
                      <h3>Privacy Control</h3>
                      <p>
                        Passwords, full email addresses, and account permission controls
                        are not managed on this page. Those belong to Login Access.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="admin-students-empty">
                  Select one student to view learning summary.
                </div>
              )}
            </aside>
          </div>

          <section className="admin-students-course-section">
            <div>
              <h2>Course Participation</h2>
              <p>Simple course overview without exposing extra personal data.</p>
            </div>

            <div className="admin-students-course-grid">
              {students.map((student) => {
                const studentCourses = courses.filter(
                  (course) => course.ownerId === student.id,
                );
                const studentMaterials = materials.filter(
                  (material) => material.ownerId === student.id,
                );

                return (
                  <article className="admin-students-course-card" key={student.id}>
                    <h3>{student.name}</h3>
                    <p>Student ID: STU-{student.id}</p>
                    <div className="admin-students-course-footer">
                      <span>
                        <BookOpen size={13} /> {studentCourses.length} course(s)
                      </span>
                      <span>
                        <FileText size={13} /> {studentMaterials.length} file(s)
                      </span>
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