import { Navigate } from "react-router-dom";

export default function SummaryPage() {
  return <Navigate to="/student/workspace?mode=summary" replace />;
}
