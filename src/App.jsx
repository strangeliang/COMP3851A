import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import DashboardPage from "./pages/student/DashboardPage";
import UploadPage from "./pages/student/UploadPage";
import SummaryPage from "./pages/student/SummaryPage";
import QAPage from "./pages/student/QAPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminMaterialsPage from "./pages/admin/AdminMaterialsPage";
import AdminAIOutputsPage from "./pages/admin/AdminAIOutputsPage";
import AdminAccountsPage from "./pages/admin/AdminAccountsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import StudyWorkspacePage from "./pages/student/StudyWorkspacePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute role="Student">
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/upload"
        element={
          <ProtectedRoute role="Student">
            <UploadPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/workspace"
        element={
          <ProtectedRoute role="Student">
            <StudyWorkspacePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/summary"
        element={
          <ProtectedRoute role="Student">
            <SummaryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/qa"
        element={
          <ProtectedRoute role="Student">
            <QAPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="Admin">
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute role="Admin">
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/materials"
        element={
          <ProtectedRoute role="Admin">
            <AdminMaterialsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/ai-outputs"
        element={
          <ProtectedRoute role="Admin">
            <AdminAIOutputsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/accounts"
        element={
          <ProtectedRoute role="Admin">
            <AdminAccountsPage />
          </ProtectedRoute>
        }
      />

      <Route path="/dashboard.html" element={<Navigate to="/student/dashboard" replace />} />
      <Route path="/upload.html" element={<Navigate to="/student/upload" replace />} />
      <Route path="/summary.html" element={<Navigate to="/student/summary" replace />} />
      <Route path="/qa.html" element={<Navigate to="/student/qa" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}