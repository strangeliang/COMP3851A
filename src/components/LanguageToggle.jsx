import { Languages } from "lucide-react";
import { useLanguage } from "../state/LanguageContext";

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  return <button type="button" className="global-language-toggle" onClick={toggleLanguage} aria-label={language === "zh" ? "Switch website to English" : "将网站切换为中文"}>
    <Languages size={17} aria-hidden="true" />
    <span>{language === "zh" ? "EN" : "中文"}</span>
  </button>;
}
