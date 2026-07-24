import { Navigate } from "react-router-dom";

export default function QAPage() {
  return <Navigate to="/student/workspace?mode=qa" replace />;
}
