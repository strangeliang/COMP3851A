import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HistoryPage from "./pages/student/HistoryPage";
import ProfilePage from "./pages/student/ProfilePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import EmailAccessPage from "./pages/EmailAccessPage";
import DashboardPage from "./pages/student/DashboardPage";
import UploadPage from "./pages/student/UploadPage";
import SummaryPage from "./pages/student/SummaryPage";
import QAPage from "./pages/student/QAPage";
import AdminSupportPage from "./pages/admin/AdminSupportPage";
import ProtectedRoute from "./components/ProtectedRoute";
import StudyWorkspacePage from "./pages/student/StudyWorkspacePage";
import LanguageToggle from "./components/LanguageToggle";

export default function App() {
  return (<>
    <LanguageToggle />
    <Routes>
      <Route path="/admin/support" element={<ProtectedRoute role="Admin"><AdminSupportPage /></ProtectedRoute>} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/student/history" element={<ProtectedRoute role="Student"><HistoryPage key="history" /></ProtectedRoute>} />
      <Route path="/student/review" element={<ProtectedRoute role="Student"><HistoryPage key="review" review /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute role="Student"><ProfilePage /></ProtectedRoute>} />
      <Route path="/" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<EmailAccessPage key="reset" purpose="reset" />} />
      <Route path="/verify-email" element={<EmailAccessPage key="verify" purpose="verify" />} />

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

      <Route path="/admin/*" element={<ProtectedRoute role="Admin"><Navigate to="/admin/support" replace /></ProtectedRoute>} />

      <Route path="/dashboard.html" element={<Navigate to="/student/dashboard" replace />} />
      <Route path="/upload.html" element={<Navigate to="/student/upload" replace />} />
      <Route path="/summary.html" element={<Navigate to="/student/summary" replace />} />
      <Route path="/qa.html" element={<Navigate to="/student/qa" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>);
}
