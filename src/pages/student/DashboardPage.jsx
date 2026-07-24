import {
  BookOpenCheck,
  BookOpenText,
  Clock3,
  Files,
  FolderPlus,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";

export default function DashboardPage() {
  const {
    currentUser,
    studentCourses,
    studentMaterials,
    currentCourse,
    currentCourseId,
    sourceFile,
    quizAttempts,
    averageQuizScore,
    materials,
    selectCourse,
    createCourse,
    deleteCourse,
    notify,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "" });
  const [formError, setFormError] = useState("");

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return studentCourses;
    return studentCourses.filter((course) =>
      `${course.code} ${course.name}`.toLowerCase().includes(query),
    );
  }, [search, studentCourses]);

  const recentMaterial = sourceFile || studentMaterials[0] || null;
  const courseMaterialCount = (courseId) =>
    materials.filter((material) => material.courseId === courseId).length;

  const stats = [
    ["Courses", studentCourses.length, GraduationCap],
    ["Materials", studentMaterials.length, Files],
    ["Completed Quiz", quizAttempts.length, BookOpenCheck],
    ["Average Score", `${averageQuizScore}%`, BookOpenText],
  ];

  function submitCourse(event) {
    event.preventDefault();
    const result = createCourse(form);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setForm({ code: "", name: "" });
    setFormError("");
  }

  function removeCourse(course) {
    const confirmed = window.confirm(
      `Delete ${course.code} ${course.name}? Its materials will be removed from the demo.`,
    );
    if (confirmed) deleteCourse(course.id);
  }

  const profileContent = (
    <>
      <h3 className="side-heading">Recent Study</h3>
      <div className="side-list">
        <div className="side-item">
          <strong>Course</strong>
          <span>{currentCourse ? `${currentCourse.code} ${currentCourse.name}` : "No course selected"}</span>
        </div>
        <div className="side-item">
          <strong>Material</strong>
          <span>{recentMaterial?.name || "No material yet"}</span>
        </div>
        <div className="side-item">
          <strong>Last Study Time</strong>
          <span>{recentMaterial?.updatedAt || currentCourse?.updatedAt || "No activity yet"}</span>
        </div>
      </div>
      <h3 className="side-heading">Quick Entry</h3>
      <div className="profile-actions-stack">
        <Link to="/student/upload">Upload Materials</Link>
        <Link to="/student/workspace">Continue Studying</Link>
      </div>
    </>
  );

  return (
    <StudentLayout
      profileProps={{
        title: "Your Profile",
        name: `Good Morning, ${currentUser?.name || "Student"}`,
        subtitle: "Courses keep every file, summary, Q&A, and quiz in the right place.",
      }}
      profileContent={profileContent}
    >
      <Toolbar value={search} onChange={setSearch} placeholder="Search your course here..." />

      <section className="purple-hero">
        <p className="hero-kicker">Student Dashboard</p>
        <h1>Welcome back, {currentUser?.name || "Student"}</h1>
        <p>
          Select a course first, then choose one or more materials for Summary, Q&A,
          and Quiz.
        </p>
        <Link className="button-link hero-action" to="/student/workspace">
          Continue Studying
        </Link>
      </section>

      <div className="quick-stats">
        {stats.map(([label, value, Icon]) => (
          <div className="quick-stat" key={label}>
            <span className="stat-icon"><Icon size={18} /></span>
            <div><span>{label}</span><strong>{value}</strong></div>
          </div>
        ))}
      </div>

      <section className="course-manager user-card">
        <div className="content-heading">
          <div>
            <h2>Courses</h2>
            <p>Create, select, and keep materials separated by course.</p>
          </div>
          <span className="text-link">{filteredCourses.length} shown</span>
        </div>

        <form className="course-form" onSubmit={submitCourse}>
          <label>
            Course Code
            <input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="INFT3050"
            />
          </label>
          <label>
            Course Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Study Companion"
            />
          </label>
          <button className="primary-button" type="submit">
            <FolderPlus size={16} /> Create Course
          </button>
        </form>
        {formError && <p className="form-error">{formError}</p>}

        <div className="course-list">
          {filteredCourses.map((course) => {
            const active = course.id === currentCourseId;
            return (
              <article className={`course-row${active ? " active" : ""}`} key={course.id}>
                <div>
                  <span>{course.code}</span>
                  <strong>{course.name}</strong>
                  <small>{courseMaterialCount(course.id)} material(s) · Updated {course.updatedAt}</small>
                </div>
                <button type="button" onClick={() => selectCourse(course.id)}>
                  {active ? "Selected" : "Select"}
                </button>
                <button
                  className="icon-danger"
                  type="button"
                  title="Delete course"
                  onClick={() => removeCourse(course)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            );
          })}
          {!filteredCourses.length && (
            <div className="empty-state">
              No course found. Create a course before uploading materials.
            </div>
          )}
        </div>
      </section>

      {!studentMaterials.length && (
        <div className="empty-state section-gap">
          No materials yet. Use Upload Materials to add TXT or MD files to a course.
          <br />
          <button type="button" onClick={() => notify("Open Upload from the sidebar or quick entry.")}>
            Show Upload Hint
          </button>
        </div>
      )}
    </StudentLayout>
  );
}
