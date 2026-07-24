import {
  BookOpen,
  FileText,
  HardDrive,
  Layers3,
  Search,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useAppData } from "../../state/AppDataContext";

export default function AdminMaterialsPage() {
  const { users, courses, materials } = useAppData();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All");
  const [courseId, setCourseId] = useState("All");
  const [selectedId, setSelectedId] = useState(materials[0]?.id || "");
  const [localStatuses, setLocalStatuses] = useState({});

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  function getStatus(material) {
    return localStatuses[material.id] || material.status;
  }

  const visibleMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();

    return materials.filter((material) => {
      const owner = userById.get(material.ownerId);
      const course = courseById.get(material.courseId);
      const text = `${material.name} ${material.type} ${material.status} ${owner?.name || ""} ${course?.code || ""} ${course?.name || ""}`.toLowerCase();

      return (
        (type === "All" || material.type === type) &&
        (courseId === "All" || material.courseId === courseId) &&
        (!query || text.includes(query))
      );
    });
  }, [courseById, courseId, materials, search, type, userById]);

  const selectedMaterial =
    materials.find((material) => String(material.id) === String(selectedId)) ||
    visibleMaterials[0] ||
    materials[0];

  const totalSize = materials.reduce(
    (sum, material) => sum + Number(material.size || 0),
    0,
  );

  const typeCounts = materials.reduce(
    (counts, material) => {
      counts[material.type] = (counts[material.type] || 0) + 1;
      return counts;
    },
    {},
  );

  function formatSize(size) {
    if (!size) return "0 KB";
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  function updateSelectedStatus(nextStatus) {
    if (!selectedMaterial) return;
    setLocalStatuses((current) => ({
      ...current,
      [selectedMaterial.id]: nextStatus,
    }));
  }

  return (
    <>
      <style>{`
        .admin-materials-page {
          display: grid;
          gap: 22px;
        }

        .admin-materials-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 250px;
          gap: 18px;
        }

        .admin-materials-title-card,
        .admin-materials-side-card,
        .admin-materials-stat,
        .admin-materials-panel,
        .admin-materials-detail,
        .admin-materials-course-card {
          border: 1px solid #ece9f2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 14px 38px rgba(60, 42, 102, 0.08);
        }

        .admin-materials-title-card {
          position: relative;
          overflow: hidden;
          padding: 28px 30px;
          color: #fff;
          background: #6f32ff;
        }

        .admin-materials-title-card::after {
          content: "";
          position: absolute;
          right: -46px;
          bottom: -70px;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
        }

        .admin-materials-kicker {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 12px;
          color: #ded0ff;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .admin-materials-title-card h1 {
          max-width: 650px;
          margin: 0;
          font-size: clamp(30px, 3vw, 44px);
          line-height: 1.05;
          font-weight: 800;
        }

        .admin-materials-title-card p {
          max-width: 620px;
          margin: 14px 0 0;
          color: #eee7ff;
          font-size: 14px;
        }

        .admin-materials-side-card {
          display: grid;
          align-content: center;
          gap: 14px;
          padding: 22px;
        }

        .admin-materials-side-card span {
          color: #77727f;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-materials-side-card strong {
          color: #27252d;
          font-size: 36px;
          line-height: 1;
        }

        .admin-materials-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-materials-stat {
          display: flex;
          gap: 12px;
          align-items: center;
          min-height: 78px;
          padding: 16px;
        }

        .admin-materials-stat-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-materials-stat span,
        .admin-materials-stat strong {
          display: block;
        }

        .admin-materials-stat span {
          color: #77727f;
          font-size: 12px;
        }

        .admin-materials-stat strong {
          margin-top: 2px;
          color: #27252d;
          font-size: 20px;
        }

        .admin-materials-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 315px;
          gap: 18px;
          align-items: start;
        }

        .admin-materials-panel,
        .admin-materials-detail {
          padding: 22px;
        }

        .admin-materials-panel-heading {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }

        .admin-materials-panel-heading h2,
        .admin-materials-detail h2,
        .admin-materials-course-section h2 {
          margin: 0;
          color: #27252d;
          font-size: 20px;
        }

        .admin-materials-panel-heading p,
        .admin-materials-detail p,
        .admin-materials-course-section p {
          margin: 5px 0 0;
          color: #77727f;
          font-size: 12px;
        }

        .admin-materials-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 145px 180px;
          gap: 12px;
          margin-bottom: 16px;
        }

        .admin-materials-search {
          display: flex;
          gap: 10px;
          align-items: center;
          min-height: 46px;
          padding: 0 14px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          background: #fcfcfe;
        }

        .admin-materials-search input {
          width: 100%;
          min-height: 40px;
          padding: 0;
          border: 0;
          outline: 0;
          background: transparent;
        }

        .admin-materials-tools select {
          min-height: 46px;
          padding: 0 12px;
          border: 1px solid #ece9f2;
          border-radius: 10px;
          color: #27252d;
          background: #fcfcfe;
        }

        .admin-materials-list {
          display: grid;
          gap: 12px;
        }

        .admin-materials-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 15px;
          border: 1px solid #ece9f2;
          border-radius: 14px;
          background: #fff;
        }

        .admin-materials-row.active {
          border-color: rgba(111, 50, 255, 0.42);
          background: #f7f3ff;
        }

        .admin-materials-file-line {
          display: flex;
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        .admin-materials-file-icon {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-materials-name {
          margin: 0;
          overflow: hidden;
          color: #27252d;
          font-size: 14px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-materials-subtext {
          margin: 5px 0 0;
          overflow: hidden;
          color: #77727f;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-materials-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 9px;
        }

        .admin-materials-pill {
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

        .admin-materials-pill.ready,
        .admin-materials-pill.checked {
          color: #1d7a43;
          background: #effaf2;
        }

        .admin-materials-pill.flagged {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-materials-view-button,
        .admin-materials-action-button {
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

        .admin-materials-detail-card {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .admin-materials-detail-block {
          padding: 14px;
          border-radius: 12px;
          background: #f7f3ff;
        }

        .admin-materials-detail-block strong {
          display: block;
          margin-bottom: 6px;
          color: #6f32ff;
          font-size: 12px;
          text-transform: uppercase;
        }

        .admin-materials-detail-block span {
          color: #4d4855;
          font-size: 13px;
        }

        .admin-materials-action-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 4px;
        }

        .admin-materials-action-button.secondary {
          color: #6f32ff;
          background: #eee7ff;
        }

        .admin-materials-action-button.danger {
          color: #be2640;
          background: #fff3f5;
        }

        .admin-materials-empty {
          padding: 28px;
          border: 1px dashed #d9cdf7;
          border-radius: 14px;
          color: #77727f;
          text-align: center;
          background: #fcfcfe;
          font-size: 13px;
        }

        .admin-materials-course-section {
          display: grid;
          gap: 14px;
        }

        .admin-materials-course-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-materials-course-card {
          padding: 18px;
        }

        .admin-materials-course-card h3 {
          margin: 0;
          color: #27252d;
          font-size: 16px;
        }

        .admin-materials-course-card p {
          margin: 7px 0 12px;
        }

        .admin-materials-course-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #77727f;
          font-size: 12px;
        }

        @media (max-width: 1100px) {
          .admin-materials-hero,
          .admin-materials-main-grid {
            grid-template-columns: 1fr;
          }

          .admin-materials-stat-grid,
          .admin-materials-course-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .admin-materials-stat-grid,
          .admin-materials-tools,
          .admin-materials-row,
          .admin-materials-course-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <AdminLayout>
        <section className="admin-materials-page">
          <div className="admin-materials-hero">
            <div className="admin-materials-title-card">
              <p className="admin-materials-kicker">
                <UploadCloud size={16} /> Admin Materials
              </p>
              <h1>Study Material Management</h1>
              <p>
                Check uploaded study files, course ownership, file type, and
                review status for the local prototype.
              </p>
            </div>

            <div className="admin-materials-side-card">
              <span>Total Storage Used</span>
              <strong>{formatSize(totalSize)}</strong>
              <p>Demo storage count from current uploaded materials.</p>
            </div>
          </div>

          <div className="admin-materials-stat-grid">
            <div className="admin-materials-stat">
              <span className="admin-materials-stat-icon">
                <FileText size={18} />
              </span>
              <div>
                <span>Total Files</span>
                <strong>{materials.length}</strong>
              </div>
            </div>

            <div className="admin-materials-stat">
              <span className="admin-materials-stat-icon">
                <BookOpen size={18} />
              </span>
              <div>
                <span>Courses</span>
                <strong>{courses.length}</strong>
              </div>
            </div>

            <div className="admin-materials-stat">
              <span className="admin-materials-stat-icon">
                <Layers3 size={18} />
              </span>
              <div>
                <span>TXT Files</span>
                <strong>{typeCounts.TXT || 0}</strong>
              </div>
            </div>

            <div className="admin-materials-stat">
              <span className="admin-materials-stat-icon">
                <HardDrive size={18} />
              </span>
              <div>
                <span>MD Files</span>
                <strong>{typeCounts.MD || 0}</strong>
              </div>
            </div>
          </div>

          <div className="admin-materials-main-grid">
            <section className="admin-materials-panel">
              <div className="admin-materials-panel-heading">
                <div>
                  <h2>Uploaded Files</h2>
                  <p>Search by file name, student, course, or file status.</p>
                </div>
                <SlidersHorizontal size={19} color="#6f32ff" />
              </div>

              <div className="admin-materials-tools">
                <label className="admin-materials-search">
                  <Search size={17} color="#77727f" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search files, students, or courses..."
                  />
                </label>

                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option>All</option>
                  <option>TXT</option>
                  <option>MD</option>
                </select>

                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                >
                  <option value="All">All Courses</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} {course.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-materials-list">
                {visibleMaterials.map((material) => {
                  const owner = userById.get(material.ownerId);
                  const course = courseById.get(material.courseId);
                  const status = getStatus(material);
                  const active = String(selectedMaterial?.id) === String(material.id);

                  return (
                    <article
                      className={`admin-materials-row${active ? " active" : ""}`}
                      key={material.id}
                    >
                      <div>
                        <div className="admin-materials-file-line">
                          <span className="admin-materials-file-icon">
                            <FileText size={18} />
                          </span>
                          <div>
                            <p className="admin-materials-name">{material.name}</p>
                            <p className="admin-materials-subtext">
                              {owner?.name || "Unknown Student"} ·{" "}
                              {course?.code || "Deleted Course"} ·{" "}
                              {formatSize(material.size)}
                            </p>
                          </div>
                        </div>

                        <div className="admin-materials-meta">
                          <span className="admin-materials-pill">{material.type}</span>
                          <span className={`admin-materials-pill ${status.toLowerCase()}`}>
                            {status}
                          </span>
                          <span className="admin-materials-pill">
                            {material.uploadedAt || "No date"}
                          </span>
                        </div>
                      </div>

                      <button
                        className="admin-materials-view-button"
                        type="button"
                        onClick={() => setSelectedId(material.id)}
                      >
                        View
                      </button>
                    </article>
                  );
                })}

                {!visibleMaterials.length && (
                  <div className="admin-materials-empty">
                    No study materials match the current filters.
                  </div>
                )}
              </div>
            </section>

            <aside className="admin-materials-detail">
              <h2>File Details</h2>
              <p>Review the selected material and mark its local status.</p>

              {selectedMaterial ? (
                <div className="admin-materials-detail-card">
                  <div className="admin-materials-detail-block">
                    <strong>File Name</strong>
                    <span>{selectedMaterial.name}</span>
                  </div>

                  <div className="admin-materials-detail-block">
                    <strong>Owner</strong>
                    <span>
                      <UserRound size={14} />{" "}
                      {userById.get(selectedMaterial.ownerId)?.name || "Unknown"}
                    </span>
                  </div>

                  <div className="admin-materials-detail-block">
                    <strong>Course</strong>
                    <span>
                      {courseById.get(selectedMaterial.courseId)?.code || "Unknown"} ·{" "}
                      {courseById.get(selectedMaterial.courseId)?.name || "Deleted course"}
                    </span>
                  </div>

                  <div className="admin-materials-detail-block">
                    <strong>File Info</strong>
                    <span>
                      {selectedMaterial.type} · {formatSize(selectedMaterial.size)} ·{" "}
                      {selectedMaterial.updatedAt || "No update time"}
                    </span>
                  </div>

                  <div className="admin-materials-detail-block">
                    <strong>Preview</strong>
                    <span>
                      {selectedMaterial.content?.slice(0, 180) ||
                        "No preview content available."}
                    </span>
                  </div>

                  <div className="admin-materials-action-row">
                    <button
                      className="admin-materials-action-button secondary"
                      type="button"
                      onClick={() => updateSelectedStatus("Checked")}
                    >
                      Mark Checked
                    </button>

                    <button
                      className="admin-materials-action-button danger"
                      type="button"
                      onClick={() => updateSelectedStatus("Flagged")}
                    >
                      Flag File
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-materials-empty">
                  Select one material to view details.
                </div>
              )}
            </aside>
          </div>

          <section className="admin-materials-course-section">
            <div>
              <h2>Course File Groups</h2>
              <p>Quick overview of how many materials each course contains.</p>
            </div>

            <div className="admin-materials-course-grid">
              {courses.map((course) => {
                const owner = userById.get(course.ownerId);
                const courseFiles = materials.filter(
                  (material) => material.courseId === course.id,
                );

                return (
                  <article className="admin-materials-course-card" key={course.id}>
                    <h3>{course.code}</h3>
                    <p>{course.name}</p>
                    <div className="admin-materials-course-footer">
                      <span>{owner?.name || "Unknown"}</span>
                      <span>{courseFiles.length} file(s)</span>
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