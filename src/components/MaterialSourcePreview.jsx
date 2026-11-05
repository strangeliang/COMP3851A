import { Download, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { citedSectionIndex, normalizeSourceLocation, parseSourceCitations, sourceSections } from "../../shared/sourceCitations.mjs";
import { useLanguage } from "../state/LanguageContext";
import HistoryRecordDialog from "./HistoryRecordDialog";
import "./MaterialSourcePreview.css";

export default function MaterialSourcePreview({ material, onClose, sourceLabel = "", location = null }) {
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const originalUrl = `/api/materials/${encodeURIComponent(String(material.id))}/original`;
  const canPreviewOriginal = ["PDF", "PNG", "JPG", "JPEG", "WEBP", "BMP"].includes(String(material.type || "").toUpperCase());
  const target = normalizeSourceLocation(location) || parseSourceCitations(sourceLabel)[0]?.location;
  const sections = sourceSections(material.content);
  const citedIndex = citedSectionIndex(sections, target);
  const targetRef = useRef(null);
  const targetLabel = target ? `${target.kind === 'slide' ? t('Slide', '幻灯片') : t('Page', '页')} ${target.number}` : '';
  const originalPreviewUrl = `${originalUrl}?preview=1${citedIndex >= 0 && target?.kind === 'page' && String(material.type).toUpperCase() === 'PDF' ? `#page=${target.number}` : ''}`;
  useEffect(() => {
    if (citedIndex < 0) return;
    const focusTarget = () => { targetRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' }); targetRef.current?.focus?.({ preventScroll: true }); };
    if (typeof requestAnimationFrame !== 'function') { focusTarget(); return; }
    const frame = requestAnimationFrame(focusTarget);
    return () => cancelAnimationFrame(frame);
  }, [material.id, material.content, target?.kind, target?.number, citedIndex]);
  return <HistoryRecordDialog
    title={`${sourceLabel ? `${sourceLabel} ` : ""}${material.name}`}
    subtitle={t("Check the material used for this study activity.", "核对本次学习使用的资料。")}
    closeLabel={t("Close source preview", "关闭来源预览")}
    onClose={onClose}
  >
    <div className="material-source-preview" data-react-i18n>
      {material.parseWarning && <p className="state-banner"><strong>{t("Reading note:", "读取提示：")}</strong> {material.parseWarning}</p>}
      {material.hasOriginal ? <div className="material-original-actions">
        {canPreviewOriginal && <a href={originalPreviewUrl} target="_blank" rel="noopener noreferrer">
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
      {target && <p className={`material-citation-location${citedIndex < 0 ? ' is-missing' : ''}`} role="status">{citedIndex >= 0
        ? t(`The cited ${targetLabel} is highlighted below.`, `已在下方高亮引用位置：${targetLabel}。`)
        : t(`The cited ${targetLabel} could not be located in the extracted text. The full text is shown below; check the original file.`, `提取文字中未找到引用位置 ${targetLabel}。下方显示完整文字，请核对原文件。`)}</p>}
      <pre className="material-source-text">{citedIndex >= 0 ? sections.map((section, index) => index === citedIndex
        ? <mark key={index} ref={targetRef} tabIndex={-1} className="material-cited-section">{section.text}</mark>
        : <span key={index}>{section.text}</span>) : material.content || t("No extracted text is available for this material.", "这份资料没有可用的提取文字。")}</pre>
    </div>
  </HistoryRecordDialog>;
}
