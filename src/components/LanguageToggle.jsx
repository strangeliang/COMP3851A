import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useLanguage } from "../state/LanguageContext";
import "./LanguageToggle.css";

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const options = useRef([]);
  const menuId = useId();
  const t = (en, zh) => language === "zh" ? zh : en;
  const choices = [{ value: "en", label: "English" }, { value: "zh", label: "简体中文" }];

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    options.current[language === "zh" ? 1 : 0]?.focus();
    const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, language]);

  function choose(value) {
    setLanguage(value);
    setOpen(false);
    trigger.current?.focus();
  }

  return <div className="settings-language-picker" ref={container} data-react-i18n onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const current = options.current.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + 2) % 2;
      options.current[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="settings-language-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
      <Languages size={18} aria-hidden="true" />
      <span>{t("Change language", "切换语言")}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="settings-language-menu" id={menuId} role="menu" aria-label={t("Choose website language", "选择网站语言")}>
      {choices.map(({ value, label }, index) => <button key={value} ref={element => { options.current[index] = element; }} type="button" role="menuitemradio" aria-checked={language === value} onClick={() => choose(value)}>
        <span>{label}</span>{language === value && <Check size={17} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
