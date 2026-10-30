import { Download, ExternalLink } from "lucide-react";
import { useLanguage } from "../state/LanguageContext";
import HistoryRecordDialog from "./HistoryRecordDialog";
import "./MaterialSourcePreview.css";

export default function MaterialSourcePreview({ material, onClose, sourceLabel = "" }) {
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const originalUrl = `/api/materials/${encodeURIComponent(String(material.id))}/original`;
  const canPreviewOriginal = ["PDF", "PNG", "JPG", "JPEG", "WEBP", "BMP"].includes(String(material.type || "").toUpperCase());
  return <HistoryRecordDialog
    title={`${sourceLabel ? `${sourceLabel} ` : ""}${material.name}`}
    subtitle={t("Check the material used for this study activity.", "核对本次学习使用的资料。")}
    closeLabel={t("Close source preview", "关闭来源预览")}
    onClose={onClose}
  >
    <div className="material-source-preview" data-react-i18n>
      {material.parseWarning && <p className="state-banner"><strong>{t("Reading note:", "读取提示：")}</strong> {material.parseWarning}</p>}
      {material.hasOriginal ? <div className="material-original-actions">
        {canPreviewOriginal && <a href={`${originalUrl}?preview=1`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" />{t("Open original", "打开原文件")}
        </a>}
        <a href={originalUrl}><Download size={16} aria-hidden="true" />{t("Download original", "下载原文件")}</a>
      </div> : <p className="state-banner" role="status">
        {t("The original file was not saved for this older material. Only its extracted text is available here. Upload the original again to enable original-file preview and download.", "这份旧资料未保存原文件，此处只能查看已提取文字。重新上传原文件后才能预览和下载原文件。")}
      </p>}
      <h3>{t("Full extracted text", "完整提取文字")}</h3>
      <p className="material-source-note">{t(
        "This is the extracted text supplied to the AI, not the original file. Layout, images and OCR accuracy may differ; check the original where available.",
        "这是提供给 AI 的提取文字，不是原文件。排版、图片和 OCR 识别可能存在差异，请在原文件可用时对照核查。",
      )}</p>
      <pre className="material-source-text">{material.content || t("No extracted text is available for this material.", "这份资料没有可用的提取文字。")}</pre>
    </div>
  </HistoryRecordDialog>;
}
