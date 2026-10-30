import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MessageCircleQuestion, X } from 'lucide-react';
import { useAppData } from '../state/AppDataContext';
import { getLoginConversation, sendLoginMessage } from '../services/ticketApiService';
import { containsSecret } from '../services/helpChat';
import SupportTickets from './SupportTickets';
import SupportRequestForm from './SupportRequestForm';
import './HelpAssistant.css';
import { useLanguage } from '../state/LanguageContext';
import useChatSize, { chatWindowSizes } from '../hooks/useChatSize';
import { workspaceSessionId, readWorkspaceMemory, writeWorkspaceMemory, subscribeWorkspaceMemory } from '../services/workspaceSession';

const emptyDraft = { text: '', ticketId: null, pendingClientId: null, attempt: null, error: '' };

export default function HelpAssistant() {
  const { currentUser } = useAppData();
  if (currentUser?.role !== 'Student') return null;
  const sessionId = workspaceSessionId();
  return <LoginChat key={`${currentUser.id}:${sessionId}`} userId={currentUser.id} sessionId={sessionId} />;
}
function LoginChat({ userId, sessionId }) {
  const { language } = useLanguage();
  const [chatSize, setChatSize] = useChatSize();
  const t = (en, zh) => language === 'zh' ? zh : en;
  const [open, setOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [viewport, setViewport] = useState(null);
  const [view, setView] = useState('chat');
  const [supportId, setSupportId] = useState(null);
  const [ticket, setTicket] = useState(null);
  const draftKey = `help-draft:${userId}`;
  const getDraft = useCallback(() => readWorkspaceMemory(draftKey, emptyDraft, sessionId), [draftKey, sessionId]);
  const draftRecord = useSyncExternalStore(subscribeWorkspaceMemory, getDraft, () => emptyDraft);
  const draft = draftRecord.text;
  const saving = Boolean(draftRecord.pendingClientId);
  function setDraft(value) {
    writeWorkspaceMemory(draftKey, previous => ({ ...emptyDraft, ...previous, text: value, error: '' }), sessionId);
  }
  const [notice, setNotice] = useState('');
  const [aiFailure, setAiFailure] = useState(null);
  const [retry, setRetry] = useState(0);
  const attempt = useRef(draftRecord.attempt);
  const lock = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const log = useRef(null);
  const nearBottom = useRef(true);
  const launcher = useRef(null);
  const closeButton = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return;
    const visual = window.visualViewport;
    function resize() {
      if (!Number.isFinite(visual.height) || visual.height <= 0) return;
      const height = Math.round(visual.height);
      const bottom = Math.max(0, Math.round((window.innerHeight || height) - height - (visual.offsetTop || 0)));
      setViewport(previous => previous?.height === height && previous?.bottom === bottom ? previous : { height, bottom });
    }
    resize();
    visual.addEventListener('resize', resize); visual.addEventListener('scroll', resize);
    return () => { visual.removeEventListener('resize', resize); visual.removeEventListener('scroll', resize); };
  }, [open]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const openHelp = event => {
      setView(event.detail?.view === 'history' ? 'history' : 'chat');
      setSupportId(typeof event.detail?.ticketId === 'string' ? event.detail.ticketId : null);
      setOpen(true);
    };
    window.addEventListener('study-open-help', openHelp);
    return () => window.removeEventListener('study-open-help', openHelp);
  }, []);
  useEffect(() => {
    if (!open || view !== 'chat') return;
    let cancelled = false, running = false, controller;
    async function refresh() {
      if (running || lock.current || (typeof document !== 'undefined' && document.hidden)) return;
      running = true; controller = new AbortController();
      const version = epoch.current;
      try {
        const result = await getLoginConversation(controller.signal);
        if (!cancelled && version === epoch.current && !lock.current) {
          setTicket(old => !old || old.id !== result.ticket.id || result.ticket.version >= old.version ? result.ticket : old);
          setNotice('');
        }
      } catch (e) { if (!cancelled) setNotice(e.message); }
      finally { running = false; }
    }
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => { cancelled = true; controller?.abort(); clearInterval(timer); };
  }, [open, view, retry]);
  useEffect(() => {
    if (!ticket?.id) return;
    writeWorkspaceMemory(draftKey, previous => {
      const current = previous || emptyDraft;
      if (current.ticketId === ticket.id) return current;
      return { ...emptyDraft, text: current.ticketId ? '' : current.text, ticketId: ticket.id };
    }, sessionId);
    setAiFailure(null); attempt.current = readWorkspaceMemory(draftKey, emptyDraft, sessionId).attempt;
  }, [ticket?.id, draftKey, sessionId]);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  useEffect(() => {
    if (nearBottom.current && log.current && (ticket?.replies.length || notice || aiFailure || draftRecord.error || saving)) log.current.scrollTop = log.current.scrollHeight;
  }, [ticket, open, notice, aiFailure, draftRecord.error, saving]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function send(value) {
    const text = value.trim();
    if (!text || !ticket || lock.current || saving || workspaceSessionId() !== sessionId) return;
    if (containsSecret(text)) {
      setDraft(''); setNotice(t('Possible credentials detected. Nothing was sent. Remove passwords, codes and API keys.', '检测到可能的凭据，消息没有发送。请移除密码、验证码和 API Key。')); return;
    }
    lock.current = true; epoch.current++; setNotice(''); setAiFailure(null);
    let clientId;
    function finishDraft(error = '') {
      writeWorkspaceMemory(draftKey, previous => previous?.pendingClientId === clientId
        ? { ...previous, text: error ? text : '', pendingClientId: null, attempt: error ? previous.attempt : null, error } : previous, sessionId);
    }
    try {
      if (!aiFailure) attempt.current = readWorkspaceMemory(draftKey, emptyDraft, sessionId).attempt;
      if (!attempt.current || attempt.current.text !== text || attempt.current.id !== ticket.id)
        attempt.current = { text, id: ticket.id, clientId: crypto.randomUUID() };
      clientId = attempt.current.clientId;
      writeWorkspaceMemory(draftKey, previous => ({ ...emptyDraft, ...previous, pendingClientId: clientId, attempt: attempt.current, error: '' }), sessionId);
      const result = await sendLoginMessage(ticket.id, text, language, attempt.current.clientId);
      finishDraft();
      if (!mounted.current) return;
      nearBottom.current = true; setTicket(result.ticket);
      if(result.aiError) setAiFailure({text,message:result.aiError.message});
      else attempt.current = null;
    } catch (e) { finishDraft(e.message); if (mounted.current) setNotice(e.message); }
    finally { lock.current = false; }
  }
  const messages = ticket?.replies.filter(e => e.kind === 'reply') || [];
  return <aside className="help-assistant" data-react-i18n aria-label={t('Application help', '网站帮助')}
    data-short-viewport={open && viewport?.height < 520 ? true : undefined}
    style={open && viewport ? { '--help-viewport-height': `${viewport.height}px`, '--help-keyboard-inset': `${viewport.bottom}px` } : undefined}>
    {open && <section className="help-assistant-panel" id="help-assistant-panel" style={{ '--help-chat-width': `${chatWindowSizes[chatSize].width}px`, '--help-chat-height': `${chatWindowSizes[chatSize].height}px` }} role="dialog" aria-labelledby="help-assistant-title" onKeyDown={e => { if (e.key === 'Escape' && e.target.tagName !== 'SELECT') close(); }}>
      <header className="help-assistant-header"><div><h2 id="help-assistant-title">Ask Me</h2><p>{t('Powered by Gemini · Website support', 'Gemini AI · 网站使用帮助')}</p></div><div className="help-assistant-header-actions"><button ref={closeButton} onClick={close} aria-label={t('Close help', '关闭帮助')}><X size={20}/></button></div></header>
      <div className="help-assistant-content" ref={log} tabIndex={0} aria-label={t('Help conversation and options', '帮助对话及选项')}
        onScroll={() => { if (log.current) nearBottom.current = log.current.scrollHeight-log.current.scrollTop-log.current.clientHeight < 60; }}>
      <nav className="help-assistant-categories help-assistant-view-nav"><button aria-pressed={view === 'chat'} onClick={() => setView('chat')}>{t('This login', '本次会话')}</button><button aria-pressed={view === 'history'} onClick={() => setView('history')}>{t('Conversation history', '历史会话')}</button></nav>
      <div className="help-assistant-size"><label htmlFor="help-chat-size">{t('Chat window size', '聊天窗口大小')}</label><select id="help-chat-size" value={chatSize} onChange={event => setChatSize(event.target.value)}>{Object.entries(chatWindowSizes).map(([value, labels]) => <option key={value} value={value}>{language === 'zh' ? labels.zh : labels.en}</option>)}</select></div>
      {view === 'new' ? <div className="help-request-panel"><SupportRequestForm zh={language === 'zh'} onCancel={() => setView('chat')} onCreated={created => { setSupportId(created.id); setView('history'); }} /></div> : view === 'history' ? <div className="help-history-panel"><SupportTickets key={supportId || 'all'} initialTicketId={supportId} onNewTicket={() => setView('chat')}/></div> : <>
        <div className="help-session-info">
          <p className="help-session-brief">{t('Messages go to Gemini and support staff and are saved. Never share passwords, codes or API keys.', '消息会发送给 Gemini 和管理员并保存。请勿发送密码、验证码或 API Key。')}</p>
          <details className="help-privacy-details" open={privacyOpen} onToggle={event => { setPrivacyOpen(event.currentTarget.open); if (event.currentTarget.open) nearBottom.current = false; }}>
            <summary>{t('Privacy and AI information', '隐私与 AI 说明')}</summary>
            <p className="help-session-notice">{t('Messages and recent support context are sent to Google Gemini for replies, saved, and visible to support administrators. Each login has its own record. Private study chats and files are not included.', '消息及近期客服上下文会发送给 Google Gemini 生成回复，并保存供管理员查看。每次登录一条记录，不包含私人学习问答及文件。')}</p>
            <p className="help-session-notice">{t('AI can make mistakes and cannot change your account. Administrators can also reply here; updates are checked every 8 seconds.', 'AI 可能出错，不能修改账号。管理员也可在此回复，每 8 秒检查更新。')}</p>
            {ticket && <p className="help-session-meta">{t('Started: ', '开始时间：')}{new Date(ticket.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-GB')} · {language === 'zh' ? ({Open:'待处理','In progress':'处理中',Resolved:'已解决'})[ticket.status] : ticket.status}</p>}
          </details>
        </div>
        <div className="help-assistant-log" role="log" aria-live="polite">
          <p className="help-assistant-answer">{t('How can I help? Ask about login, uploads, Quiz or Study History.', '有什么可以帮你？可以询问登录、上传、Quiz 或学习历史。')}</p>
          {messages.map(m => <div key={m.id} className="help-saved-message"><small>{m.role === 'AI' ? t('Gemini · AI reply', 'Gemini · AI 回复') : m.role === 'FAQ' ? t('Ask Me · Preset FAQ', 'Ask Me · 预设 FAQ') : m.role === 'Admin' ? t('Support · ', '管理员 · ')+m.name : t('You', '你')}</small><p className={m.role === 'Student' ? 'help-assistant-question' : 'help-assistant-answer'}>{m.text}</p><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-GB')}</time></div>)}
          {saving && <p role="status" className="help-assistant-answer">{t('Gemini is replying…', 'Gemini 正在回复…')}</p>}
        </div>
        <div className="help-assistant-tools">
          <details className="help-quick-details" open={toolsOpen} onToggle={event => { setToolsOpen(event.currentTarget.open); if (event.currentTarget.open) nearBottom.current = false; }}>
            <summary>{t('Quick help and human support', '快捷帮助与人工客服')}</summary>
          <div className="help-human-support">
            <button type="button" disabled={!ticket || saving} onClick={() => setView('new')}>
              {t('Request human support','转人工客服')}
            </button>
            <p>{t('Human support is not live chat. Submit one issue per ticket; you do not need to stay online.', '人工支持不是实时聊天。每个问题提交一张工单，无需一直在线等待。')}</p>
          </div>
          <div className="help-assistant-categories">{(language === 'zh' ? ['登录帮助','上传帮助','Quiz 帮助','学习历史'] : ['Login help','Upload help','Quiz help','Study history']).map(q => <button key={q} disabled={saving || !ticket} onClick={() => send(q)}>{q}</button>)}</div>
          </details>
          {ticket?.humanSupport && <p role="status">{({Waiting:t('Waiting for human support. AI replies do not close this request.','等待人工处理。AI 回复不会结束此申请。'),'In progress':t('An administrator is handling your request.','管理员正在处理你的申请。'),Resolved:t('Human support resolved this request. You can request help again.','人工申请已解决。如需帮助，可以再次申请。')})[ticket.humanSupport]}</p>}
          {(notice || draftRecord.error) && <p role="status">{notice || draftRecord.error} <button onClick={() => setRetry(n => n+1)}>{t('Refresh', '刷新')}</button></p>}
          {aiFailure && <p role="alert">{t('Your message is saved, but Gemini could not reply. You can retry or wait for an administrator. ', '消息已保存，但 Gemini 暂时无法回复。可重试或等待管理员处理。')}{aiFailure.message} <button disabled={saving} onClick={()=>send(aiFailure.text)}>{t('Retry AI reply','重试 AI 回复')}</button></p>}
          {!ticket && !notice && <p role="status">{t('Loading your conversation…', '正在加载本次会话…')}</p>}
        </div>
      </>}
      </div>
      {view === 'chat' && <div className="help-assistant-composer">
        <form onSubmit={e => { e.preventDefault(); send(draft); }}><input disabled={saving || !ticket} aria-label="Describe your problem without credentials" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} autoComplete="off" placeholder={t('Describe your problem…', '请描述你的问题…')}/><button disabled={saving || !ticket || !draft.trim()}>{saving ? t('Sending…','发送中…') : t('Send','发送')}</button></form>
        <small>{t('Saved automatically when sent. No separate ticket submission.', '发送后自动保存，无需另外提交工单。')}</small>
      </div>}
    </section>}
    <button className="help-assistant-launcher" ref={launcher} onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls={open ? 'help-assistant-panel' : undefined}><MessageCircleQuestion size={24}/><span>Ask Me</span></button>
  </aside>;
}
