import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  EyeOff,
  FileText,
  Filter,
  LockKeyhole,
  MessageCircleQuestion,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useAppData } from "../../state/AppDataContext";

const initialQAActivities = [
  {
    id: "QA-001",
    studentId: 1,
    courseId: "inft3050",
    category: "Course clarification",
    status: "Normal",
    riskLevel: "Low",
    time: "Today 10:35",
    action: "No action required",
  },
  {
    id: "QA-002",
    studentId: 3,
    courseId: "hci",
    category: "Study support",
    status: "Pending",
    riskLevel: "Medium",
    time: "Yesterday 16:20",
    action: "Waiting for admin check",
  },
  {
    id: "QA-003",
    studentId: 1,
    courseId: "inft3851a",
    category: "Quiz related",
    status: "Flagged",
    riskLevel: "High",
    time: "3 days ago",
    action: "Flagged for review",
  },
];

export default function AdminAIOutputsPage() {
  const { courses, qaUses } = useAppData();
  const [records, setRecords] = useState(initialQAActivities);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [selectedId, setSelectedId] = useState(initialQAActivities[0]?.id || "");

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  function studentCode(studentId) {
    return `STU-${String(studentId).padStart(3, "0")}`;
  }

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const course = courseById.get(record.courseId);
      const text =
        `${record.id} ${studentCode(record.studentId)} ${course?.code || ""} ${record.category} ${record.status} ${record.riskLevel}`.toLowerCase();

      return (
        (status === "All" || record.status === status) &&
        (!query || text.includes(query))
      );
    });
  }, [courseById, records, search, status]);

  const selectedRecord =
    records.find((record) => record.id === selectedId) ||
    visibleRecords[0] ||
    records[0];

  const statusCounts = {
    All: records.length,
    Normal: records.filter((record) => record.status === "Normal").length,
    Pending: records.filter((record) => record.status === "Pending").length,
    Flagged: records.filter((record) => record.status === "Flagged").length,
  };

  function updateStatus(nextStatus) {
    if (!selectedRecord) return;

    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              status: nextStatus,
              riskLevel: nextStatus === "Flagged" ? "High" : "Low",
              action:
                nextStatus === "Flagged"
                  ? "Flagged for review"
                  : "No action required",
            }
          : record,
      ),
    );
  }

  return (
    <>
      <style>{`
        .admin-qa-page {
          display: grid;
          gap: 22px;
        }

        .admin-qa-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 245px;
          gap: 18px;
        }

        .admin-qa-title-card,
        .admin-qa-side-card,
        .admin-qa-panel,
        .admin-qa-detail,
        .admin-qa-privacy-card {
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-qa-title-card {
          position: relative;
          overflow: hidden;
          padding: 28px 30px;
          color: #fff;
          background: #6f32ff;
        }

        .admin-qa-title-card::after {
          content: "";
          position: absolute;
          right: -48px;
          bottom: -74px;
          width: 230px;
          height: 230px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
        }

        .admin-qa-kicker {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 12px;
          color: #ded0ff;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .admin-qa-title-card h1 {
          max-width: 650px;
          margin: 0;
          font-size: clamp(30px, 3vw, 44px);
          line-height: 1.05;
          font-weight: 800;
        }

        .admin-qa-title-card p {
          max-width: 620px;
          margin: 14px 0 0;
          color: #eee7ff;
          font-size: 14px;
        }

        .admin-qa-side-card {
          display: grid;
          gap: 14px;
          align-content: center;
          padding: 22px;
        }

        .admin-qa-side-card span {
          color: #77727f;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-qa-side-card strong {
          color: #27252d;
          font-size: 36px;
          line-height: 1;
        }

        .admin-qa-side-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
          line-height: 1.45;
        }

        .admin-qa-status-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-qa-stat {
          display: flex;
          gap: 12px;
          align-items: center;
          min-height: 78px;
          padding: 16px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.06);
        }

        .admin-qa-stat-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-qa-stat span,
        .admin-qa-stat strong {
          display: block;
        }

        .admin-qa-stat span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-qa-stat strong {
          margin-top: 2px;
          color: #27252d;
          font-size: 20px;
        }

        .admin-qa-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 310px;
          gap: 18px;
          align-items: start;
        }

        .admin-qa-panel,
        .admin-qa-detail {
          padding: 22px;
        }

        .admin-qa-panel-heading {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          margin-bottom: 16px;
        }

        .admin-qa-panel-heading h2,
        .admin-qa-detail h2 {
          margin: 0;
          color: #27252d;
          font-size: 20px;
        }

        .admin-qa-panel-heading p,
        .admin-qa-detail p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-qa-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 160px;
          gap: 12px;
          margin-bottom: 16px;
        }

        .admin-qa-search {
          display: flex;
          gap: 10px;
          align-items: center;
          min-height: 46px;
          padding: 0 14px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          background: #fcfcfe;
        }

        .admin-qa-search input {
          width: 100%;
          min-height: 40px;
          padding: 0;
          border: 0;
          outline: 0;
          background: transparent;
        }

        .admin-qa-tools select {
          width: 100%;
          min-height: 46px;
          padding: 0 12px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          color: #27252d;
          background: #fcfcfe;
        }

        .admin-qa-list {
          display: grid;
          gap: 12px;
        }

        .admin-qa-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 15px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
        }

        .admin-qa-row.active {
          border-color: rgba(111, 50, 255, 0.42);
          background: #f7f3ff;
        }

        .admin-qa-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 7px;
        }

        .admin-qa-pill {
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

        .admin-qa-pill.normal {
          color: #1d7a43;
          background: #effaf2;
        }

        .admin-qa-pill.pending,
        .admin-qa-pill.medium {
          color: #9b6819;
          background: #fff3d8;
        }

        .admin-qa-pill.flagged,
        .admin-qa-pill.high {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-qa-activity-title {
          margin: 0;
          overflow: hidden;
          color: #27252d;
          font-size: 14px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-qa-subtext {
          margin: 5px 0 0;
          overflow: hidden;
          color: #77727f;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-qa-view-button,
        .admin-qa-action-button {
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

        .admin-qa-action-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }

        .admin-qa-action-button.secondary {
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-qa-action-button.danger {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-qa-detail-card {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .admin-qa-detail-block {
          padding: 14px;
          border-radius: 12px;
          background: #f7f3ff;
        }

        .admin-qa-detail-block strong {
          display: block;
          margin-bottom: 6px;
          color: #6f32ff;
          font-size: 12px;
          text-transform: uppercase;
        }

        .admin-qa-detail-block span {
          color: #4d4855;
          font-size: 13px;
          line-height: 1.5;
        }

        .admin-qa-hidden-content {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
          border-radius: 12px;
          color: #4d4855;
          background: #f7f3ff;
          font-size: 13px;
          line-height: 1.5;
        }

        .admin-qa-hidden-content svg {
          flex: 0 0 auto;
          color: #6f32ff;
        }

        .admin-qa-privacy-card {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 18px;
        }

        .admin-qa-privacy-card h3 {
          margin: 0 0 6px;
          color: #27252d;
          font-size: 16px;
        }

        .admin-qa-privacy-card p {
          margin: 0;
          color: #77727f;
          font-size: 12px;
          line-height: 1.6;
        }

        .admin-qa-empty {
          padding: 28px;
          border: 1px dashed #d9cdf7;
          border-radius: 14px;
          color: #77727f;
          text-align: center;
          background: #fcfcfe;
          font-size: 13px;
        }

        @media (max-width: 1100px) {
          .admin-qa-hero,
          .admin-qa-main-grid {
            grid-template-columns: 1fr;
          }

          .admin-qa-status-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .admin-qa-status-grid,
          .admin-qa-tools,
          .admin-qa-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <AdminLayout>
        <section className="admin-qa-page">
          <div className="admin-qa-hero">
            <div className="admin-qa-title-card">
              <p className="admin-qa-kicker">
                <MessageCircleQuestion size={16} /> Privacy Safe Review
              </p>
              <h1>Q&amp;A Activity Management</h1>
              <p>
                Monitor Q&amp;A usage, risk status, and course activity without
                exposing students’ private questions or AI answers.
              </p>
            </div>

            <div className="admin-qa-side-card">
              <span>Live Demo Q&amp;A Uses</span>
              <strong>{qaUses}</strong>
              <p>Only usage count is shown. Personal Q&amp;A content is hidden.</p>
            </div>
          </div>

          <div className="admin-qa-status-grid">
            <div className="admin-qa-stat">
              <span className="admin-qa-stat-icon">
                <FileText size={18} />
              </span>
              <div>
                <span>Total Logs</span>
                <strong>{statusCounts.All}</strong>
              </div>
            </div>

            <div className="admin-qa-stat">
              <span className="admin-qa-stat-icon">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <span>Normal</span>
                <strong>{statusCounts.Normal}</strong>
              </div>
            </div>

            <div className="admin-qa-stat">
              <span className="admin-qa-stat-icon">
                <Clock3 size={18} />
              </span>
              <div>
                <span>Pending</span>
                <strong>{statusCounts.Pending}</strong>
              </div>
            </div>

            <div className="admin-qa-stat">
              <span className="admin-qa-stat-icon">
                <AlertCircle size={18} />
              </span>
              <div>
                <span>Flagged</span>
                <strong>{statusCounts.Flagged}</strong>
              </div>
            </div>
          </div>

          <div className="admin-qa-main-grid">
            <section className="admin-qa-panel">
              <div className="admin-qa-panel-heading">
                <div>
                  <h2>Q&amp;A Activity Logs</h2>
                  <p>Search anonymous records by course, category, or status.</p>
                </div>
                <Filter size={19} color="#6f32ff" />
              </div>

              <div className="admin-qa-tools">
                <label className="admin-qa-search">
                  <Search size={17} color="#77727f" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search anonymous ID, course, category, or status..."
                  />
                </label>

                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Normal</option>
                  <option>Pending</option>
                  <option>Flagged</option>
                </select>
              </div>

              <div className="admin-qa-list">
                {visibleRecords.map((record) => {
                  const course = courseById.get(record.courseId);
                  const active = selectedRecord?.id === record.id;

                  return (
                    <article
                      className={`admin-qa-row${active ? " active" : ""}`}
                      key={record.id}
                    >
                      <div>
                        <div className="admin-qa-meta">
                          <span className={`admin-qa-pill ${record.status.toLowerCase()}`}>
                            {record.status}
                          </span>
                          <span className={`admin-qa-pill ${record.riskLevel.toLowerCase()}`}>
                            {record.riskLevel} Risk
                          </span>
                          <span className="admin-qa-pill">
                            {course?.code || "Unknown Course"}
                          </span>
                          <span className="admin-qa-pill">
                            {studentCode(record.studentId)}
                          </span>
                        </div>

                        <p className="admin-qa-activity-title">{record.category}</p>

                        <p className="admin-qa-subtext">
                          Content hidden for privacy · {record.time}
                        </p>
                      </div>

                      <button
                        className="admin-qa-view-button"
                        type="button"
                        onClick={() => setSelectedId(record.id)}
                      >
                        View Log
                      </button>
                    </article>
                  );
                })}

                {!visibleRecords.length && (
                  <div className="admin-qa-empty">
                    No Q&amp;A activity records match the current search.
                  </div>
                )}
              </div>
            </section>

            <aside className="admin-qa-detail">
              <h2>Activity Details</h2>
              <p>Only safe metadata is displayed here.</p>

              {selectedRecord ? (
                <div className="admin-qa-detail-card">
                  <div className="admin-qa-detail-block">
                    <strong>Anonymous Student</strong>
                    <span>{studentCode(selectedRecord.studentId)}</span>
                  </div>

                  <div className="admin-qa-detail-block">
                    <strong>Course</strong>
                    <span>
                      {courseById.get(selectedRecord.courseId)?.code || "Unknown"} ·{" "}
                      {courseById.get(selectedRecord.courseId)?.name || "Unknown course"}
                    </span>
                  </div>

                  <div className="admin-qa-detail-block">
                    <strong>Category</strong>
                    <span>{selectedRecord.category}</span>
                  </div>

                  <div className="admin-qa-detail-block">
                    <strong>Status</strong>
                    <span>
                      {selectedRecord.status} · {selectedRecord.riskLevel} Risk ·{" "}
                      {selectedRecord.time}
                    </span>
                  </div>

                  <div className="admin-qa-hidden-content">
                    <EyeOff size={18} />
                    <span>
                      Student question content and AI answer content are hidden.
                      Admin can only review usage status and risk level.
                    </span>
                  </div>

                  <div className="admin-qa-detail-block">
                    <strong>Admin Action</strong>
                    <span>{selectedRecord.action}</span>
                  </div>

                  <div className="admin-qa-action-row">
                    <button
                      className="admin-qa-action-button secondary"
                      type="button"
                      onClick={() => updateStatus("Normal")}
                    >
                      Mark Normal
                    </button>

                    <button
                      className="admin-qa-action-button danger"
                      type="button"
                      onClick={() => updateStatus("Flagged")}
                    >
                      Flag Activity
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-qa-empty">
                  Select one Q&amp;A activity record to view safe metadata.
                </div>
              )}
            </aside>
          </div>

          <div className="admin-qa-privacy-card">
            <LockKeyhole size={20} color="#6f32ff" />
            <div>
              <h3>Privacy Rule</h3>
              <p>
                This admin page does not display the student’s exact question, AI
                response, full identity, or private study content. It only shows
                anonymous usage metadata for safety and system monitoring.
              </p>
            </div>
          </div>
        </section>
      </AdminLayout>
    </>
  );
}