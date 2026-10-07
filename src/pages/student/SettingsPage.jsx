import StudentLayout from "../../layouts/StudentLayout";
import LanguageToggle from "../../components/LanguageToggle";
import { useLanguage } from "../../state/LanguageContext";
import { CheckCircle2, Languages, MessageSquare, BookOpenText, Type } from "lucide-react";
import useChatSize, { chatWindowSizes } from "../../hooks/useChatSize";
import useStudyPreferences from "../../hooks/useStudyPreferences";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { language } = useLanguage();
  const [chatSize, setChatSize] = useChatSize();
  const [preferences, updatePreference] = useStudyPreferences();
  const t = (en, zh) => language === "zh" ? zh : en;

  return <StudentLayout><div className="student-settings" data-react-i18n>
    <header className="workspace-header" data-react-i18n>
      <h1>{t("Settings", "设置")}</h1>
      <p>{t("Choose the language and chat layout that make studying comfortable for you.", "选择适合你的界面语言和聊天窗口大小，让学习更舒适。")}</p>
    </header>
    <section className="user-card student-settings-card" aria-labelledby="settings-language-heading">
      <div className="student-settings-section-title"><span className="student-settings-icon"><Languages size={22} aria-hidden="true" /></span><div>
        <h2 id="settings-language-heading">{t("Website language", "网站语言")}</h2>
        <p>{t("Use the website in your preferred language.", "使用你偏好的语言浏览网站。")}</p>
      </div></div>
      <div className="student-settings-row"><div>
        <h3>{t("Display language", "界面语言")}</h3>
        <p>{t("Current language: English", "当前语言：简体中文")}</p>
      </div><LanguageToggle /></div>
    </section>
    <section className="user-card student-settings-card" aria-labelledby="settings-chat-heading">
      <div className="student-settings-section-title"><span className="student-settings-icon"><MessageSquare size={22} aria-hidden="true" /></span><div>
        <h2 id="settings-chat-heading">{t("Chat display", "聊天显示")}</h2>
        <p>{t("Give Ask Me more room when reading longer replies.", "为 Ask Me 留出更多空间，方便阅读较长的回复。")}</p>
      </div></div>
      <div className="student-settings-row"><div>
        <label htmlFor="settings-chat-size">{t("Chat window size", "聊天窗口大小")}</label>
        <p>{t("You can also change this inside Ask Me.", "也可以在 Ask Me 对话框内直接调整。")}</p>
      </div><select id="settings-chat-size" value={chatSize} onChange={event => setChatSize(event.target.value)}>
        {Object.entries(chatWindowSizes).map(([value, labels]) => <option key={value} value={value}>{language === "zh" ? labels.zh : labels.en}</option>)}
      </select></div>
    </section>
    <section className="user-card student-settings-card" aria-labelledby="settings-study-heading">
      <div className="student-settings-section-title"><span className="student-settings-icon"><BookOpenText size={22} aria-hidden="true" /></span><div><h2 id="settings-study-heading">{t("Study defaults", "学习默认设置")}</h2><p>{t("Used in a new study workspace. Existing choices and answers are kept.", "用于新的学习工作区，已有选择和答案会保留。")}</p></div></div>
      <div className="student-settings-row"><div><label htmlFor="settings-answer-style">{t("Default answer style", "默认回答方式")}</label><p>{t("How Q&A explains your study material.", "选择问答解释学习材料的方式。")}</p></div><select id="settings-answer-style" value={preferences.answerStyle} onChange={event => updatePreference("answerStyle", event.target.value)}>{[["simple", "Simple", "简明解释"], ["detailed", "Detailed", "详细解释"], ["example", "Example", "举例说明"], ["hint", "Hint Only", "只给提示"]].map(([value, en, zh]) => <option value={value} key={value}>{t(en, zh)}</option>)}</select></div>
      <div className="student-settings-row"><div><label htmlFor="settings-quiz-difficulty">{t("Default Quiz difficulty", "默认测验难度")}</label><p>{t("Choose a starting level for a new Quiz.", "选择新测验的默认难度。")}</p></div><select id="settings-quiz-difficulty" value={preferences.quizDifficulty} onChange={event => updatePreference("quizDifficulty", event.target.value)}>{[["easy", "Easy", "简单"], ["medium", "Medium", "中等"], ["hard", "Hard", "困难"]].map(([value, en, zh]) => <option value={value} key={value}>{t(en, zh)}</option>)}</select></div>
    </section>
    <section className="user-card student-settings-card" aria-labelledby="settings-reading-heading">
      <div className="student-settings-section-title"><span className="student-settings-icon"><Type size={22} aria-hidden="true" /></span><div><h2 id="settings-reading-heading">{t("Reading comfort", "阅读舒适度")}</h2><p>{t("Make study content easier to read.", "让学习内容更容易阅读。")}</p></div></div>
      <div className="student-settings-row"><div><label htmlFor="settings-reading-size">{t("Study text size", "学习内容字号")}</label><p>{t("Applies to study answers, questions and Ask Me replies.", "应用于学习回答、题目和 Ask Me 回复。")}</p></div><select id="settings-reading-size" value={preferences.readingSize} onChange={event => updatePreference("readingSize", event.target.value)}><option value="standard">{t("Standard", "标准")}</option><option value="large">{t("Large", "大字号")}</option></select></div>
    </section>
    <p className="student-settings-save-note"><CheckCircle2 size={16} aria-hidden="true" />{t("Preferences are saved in this browser. Display settings apply immediately; study defaults apply to new workspaces.", "偏好保存在当前浏览器中。显示设置立即生效，学习默认设置用于新的工作区。")}</p>
  </div></StudentLayout>;
}
