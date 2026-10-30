import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { useLanguage } from "../state/LanguageContext";
import "./CopySummaryButton.css";

export default function CopySummaryButton({ summary, materials }) {
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const text = [summary.paragraph,
    `${t("Key Concepts", "核心概念")}\n${summary.concepts.map(concept => `• ${concept}`).join("\n")}`,
    `${t("Sources", "资料来源")}\n${materials.map((material, index) => `[S${index + 1}] ${material.name}`).join("\n")}`,
  ].join("\n\n");
  const currentText = useRef(text);
  currentText.current = text;
  const mounted = useRef(false);
  const copying = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function copy() {
    if (copying.current) return;
    const snapshot = text;
    copying.current = true;
    setPending(true);
    setFeedback({ text: snapshot, status: "copying" });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(snapshot);
      if (mounted.current && currentText.current === snapshot) setFeedback({ text: snapshot, status: "copied" });
    } catch {
      if (mounted.current && currentText.current === snapshot) setFeedback({ text: snapshot, status: "error" });
    } finally { copying.current = false; if (mounted.current) setPending(false); }
  }
  const status = pending ? "copying" : feedback?.text === text ? feedback.status : "";
  return <div className="summary-copy-actions" data-react-i18n>
    <button type="button" disabled={pending} onClick={copy}><Copy size={15} aria-hidden="true" />{t("Copy summary", "复制总结")}</button>
    {status && <span role={status === "error" ? "alert" : "status"} className={status === "error" ? "summary-copy-error" : undefined}>{status === "copying" ? t("Copying…", "正在复制…") : status === "copied" ? t("Summary and sources copied.", "总结和资料来源已复制。") : t("Could not copy. Select the summary text and copy it manually.", "暂时无法复制，请选中总结文字后手动复制。")}</span>}
  </div>;
}
