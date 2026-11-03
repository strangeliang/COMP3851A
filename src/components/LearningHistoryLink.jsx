import { History } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../state/LanguageContext";
import "./LearningHistoryLink.css";

export default function LearningHistoryLink({ kind, courseId }) {
  const { language } = useLanguage();
  const summary = kind === "summary";
  const params = new URLSearchParams({ kind: summary ? "summary" : "qa" });
  if (courseId != null && courseId !== "") params.set("course", String(courseId));
  const label = language === "zh"
    ? summary ? "总结历史" : "问答历史"
    : summary ? "Summary history" : "Q&A history";
  return <Link className="learning-history-link" to={`/student/history?${params}`} data-react-i18n>
    <History size={17} aria-hidden="true" />{label}
  </Link>;
}
