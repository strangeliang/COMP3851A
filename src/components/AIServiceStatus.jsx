import { useAppData } from "../state/AppDataContext";
import { useLanguage } from "../state/LanguageContext";
import "./AIServiceStatus.css";

export default function AIServiceStatus() {
  const { currentUser, aiStatus, retryAIStatus } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  if (aiStatus.configured && !aiStatus.loading) return null;

  const message = !currentUser
    ? t("Sign in to use AI.", "请登录后使用 AI。")
    : aiStatus.loading
      ? t("Checking AI service configuration…", "正在检查 AI 服务配置…")
      : aiStatus.error
        ? t("Could not check AI configuration. Please retry shortly.", "暂时无法检查 AI 配置，请稍后重试。")
        : t(aiStatus.message, "AI 尚未配置，请联系应用维护人员配置服务器。");

  return (
    <div className="state-banner ai-service-status" role="status" aria-live="polite" data-react-i18n>
      <span>{message}</span>
      {currentUser && (
        <button type="button" onClick={() => retryAIStatus()} disabled={aiStatus.loading}>
          {aiStatus.loading ? t("Checking…", "正在检查…") : t("Retry", "重试")}
        </button>
      )}
    </div>
  );
}
