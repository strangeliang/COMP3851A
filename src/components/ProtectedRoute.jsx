import { Navigate, useLocation } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";

export default function ProtectedRoute({ role, children }) {
  const { currentUser } = useAppData();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (role && currentUser.role !== role) {
    return (
      <Navigate
        to={currentUser.role === "Admin" ? "/admin/dashboard" : "/student/dashboard"}
        replace
      />
    );
  }
  return children;
}
