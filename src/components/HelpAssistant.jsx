import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import { useAppData } from "../state/AppDataContext";
import { changeTickets } from "../services/ticketService";
import { containsSecret, helpReply } from "../services/helpChat";
import SupportTickets from "./SupportTickets";
import "./HelpAssistant.css";
import { useLanguage } from "../state/LanguageContext";

export default function HelpAssistant() {
  const { currentUser } = useAppData();
  const { language, toggleLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState("chat");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const log = useRef(null);
  const launcher = useRef(null);
  const closeButton = useRef(null);
  function clear() { setMessages([]); setDraft(""); setConfirm(false); setSaved(false); setNotice(""); }
  useEffect(() => { clear(); setView("chat"); }, [currentUser?.id]);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  function send(text) {
    text = text.trim();
    if (!text) return;
    if (containsSecret(text)) { setDraft(""); setNotice(language === "zh" ? "检测到可能的密码、验证码或 API Key。消息没有发送或保存，请去除凭据和数字验证码后再描述问题。" : "Possible password, verification code or API key detected. Message not added or saved. Describe the problem without credentials or numeric codes."); return; }
    setMessages((items) => [...items.slice(-7), { question: text, ...helpReply(text, language) }]);
    setDraft(""); setConfirm(false); setSaved(false); setNotice("");
  }
  const description = messages.map((m) => "You: " + m.question + "\nHelp: " + m.answer).join("\n\n");
  function save() {
    if (saved) return;
    if (description.length > 2000) { setNotice("Conversation too long. Clear chat and briefly describe the unresolved issue."); setConfirm(false); return; }
    try {
      changeTickets(window.localStorage, currentUser, { type: "create", category: messages.at(-1).category, title: messages.at(-1).question.slice(0, 100), description });
      setSaved(true); setConfirm(false); setNotice("Saved in this browser only. Not emailed or sent to support.");
    } catch (error) { setNotice(error.message); }
  }
  return <aside className="help-assistant" aria-label="Application help">
    {open && <section className="help-assistant-panel" id="help-assistant-panel" role="dialog" aria-labelledby="help-assistant-title" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <header className="help-assistant-header"><div><h2 id="help-assistant-title">Ask Me</h2><p>{language === "zh" ? "网站帮助 · 预设回复，非人工智能" : "Website help · Preset answers, not AI"}</p></div><div className="help-assistant-header-actions"><button className="help-language" onClick={toggleLanguage} aria-label="Switch language">{language === "en" ? "中文" : "EN"}</button><button ref={closeButton} onClick={close} aria-label="Close help"><X size={20} /></button></div></header>
      <nav className="help-assistant-categories help-assistant-view-nav"><button aria-pressed={view === "chat"} onClick={() => setView("chat")}>{language === "zh" ? "聊天" : "Chat"}</button><button aria-pressed={view === "tickets"} onClick={() => setView("tickets")}>{language === "zh" ? "我的本地工单" : "My local tickets"}</button></nav>
      {view === "tickets" ? <div style={{ overflowY: "auto", padding: 12 }}><SupportTickets onNewTicket={() => { setView("chat"); setNotice("Describe your issue below, then select Not solved after the reply."); }} /></div> : <>
        <div className="help-assistant-log" ref={log} role="log" aria-live="polite"><p className="help-assistant-answer">{language === "zh" ? "需要什么帮助？你可以询问登录、上传、Quiz 或学习历史。请勿输入密码、验证码或 API Key。" : "How can I help? Ask about login, uploads, Quiz or Study History. Never enter passwords, verification codes or API keys."}</p>
          {messages.map((m, i) => <div key={i}><p className="help-assistant-question">{m.question}</p><p className="help-assistant-answer">{m.answer}</p></div>)}
        </div>
        <div className="help-assistant-options">
          <div className="help-assistant-categories">{(language === "zh" ? ["登录帮助", "上传帮助", "Quiz 帮助", "学习历史"] : ["Login help", "Upload help", "Quiz help", "Study history"]).map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>
          {notice && <p role="status">{notice}</p>}
          {confirm ? <div><p>Save the conversation above as a local ticket? Review it and remove private information first. No server or email delivery.</p><button onClick={save}>Confirm save</button> <button onClick={() => setConfirm(false)}>Cancel</button></div> : messages.length > 0 && !saved && <div><button onClick={() => { setNotice("Glad that helped. No ticket created."); setSaved(true); }}>Solved</button> <button onClick={() => setConfirm(true)}>Not solved — save ticket</button></div>}
          <form onSubmit={(e) => { e.preventDefault(); send(draft); }} style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input aria-label="Describe your problem without credentials" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} autoComplete="off" placeholder={language === "zh" ? "请描述你的问题…" : "Describe your problem…"} style={{ minWidth: 0, flex: 1, padding: 10 }} /><button disabled={!draft.trim()}>{language === "zh" ? "发送" : "Send"}</button>
          </form>
          <button style={{ marginTop: 8 }} onClick={clear}>{language === "zh" ? "清空聊天" : "Clear chat"}</button>
        </div>
      </>}
    </section>}
    <button className="help-assistant-launcher" ref={launcher} onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls={open ? "help-assistant-panel" : undefined}><MessageCircleQuestion size={24} /><span>Ask Me</span></button>
  </aside>;
}
