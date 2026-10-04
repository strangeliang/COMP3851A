import { useEffect, useRef, useState } from 'react';
import { MessageSquare, History, ListChecks, Send, ShieldCheck, ArrowDown } from 'lucide-react';

export default function SupportConversation({ ticket, admin, zh, reply, setReply, busy, onSend, syncError }) {
  const t = (en, cn) => zh ? cn : en;
  const [tab, setTab] = useState('chat');
  const [unseen, setUnseen] = useState(false);
  const log = useRef(null);
  const atBottom = useRef(true);
  const messages = ticket.replies.filter(e => e.kind === 'reply');
  const updates = ticket.replies.filter(e => e.kind === 'status');
  const date = value => new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const status = value => zh ? ({Open:'待处理','In progress':'处理中',Resolved:'已解决'})[value] || value : value;
  useEffect(() => {
    if (tab !== 'chat') return;
    if (atBottom.current && log.current) { log.current.scrollTop = log.current.scrollHeight; setUnseen(false); }
    else setUnseen(true);
  }, [messages.length, tab]);
  function jump() { if (log.current) log.current.scrollTop = log.current.scrollHeight; atBottom.current = true; setUnseen(false); }
  if (ticket.isRecoveryRequest) return <section className="support-chat-window" aria-label={t('Account recovery review', '账号恢复审核')}>
    <header className="support-chat-header"><ShieldCheck size={22}/><div><h3>{t('Identity not verified', '身份未验证')}</h3><p>{t('Submitted without signing in', '来自未登录页面的申请')}</p></div></header>
    <div className="support-submitted-history"><p><strong>{t('Claimed account name', '申请人填写的账户名')}:</strong> {ticket.name}</p><p><strong>{t('Claimed linked email', '申请人填写的绑定邮箱')}:</strong> {ticket.contactEmail}</p>
      <p className="support-note">{t('These details are unverified. Direct the applicant to the email password-reset page. Notes below are admin-only and are not sent to the applicant. Resolving this ticket does not change a password.', '以上信息尚未验证。请引导申请人使用邮件密码重置页面。下方为管理员内部备注，不会发送给申请人；将工单标记为已解决不会修改密码。')}</p>
      <h4>{t('Review history', '处理记录')}</h4><p>{t('Request received', '收到申请')} · {date(ticket.createdAt)}</p>
      {ticket.replies.map(event=><article className="support-bubble incoming" key={event.id}><header><strong>{event.name}</strong><time>{date(event.createdAt)}</time></header><p>{event.kind==='status'?status(event.text):event.text}</p></article>)}
    </div>
    {syncError && <p role="status">{t('Updates could not be refreshed. Use Refresh to retry.', '暂时无法同步更新，请点击刷新重试。')}</p>}
    {admin && <form className="support-chat-composer" onSubmit={e=>{e.preventDefault();onSend();}}><label>{t('Internal note', '内部备注')}<textarea rows={3} required maxLength={2000} value={reply} disabled={busy} onChange={e=>setReply(e.target.value)} placeholder={t('Record follow-up steps; do not enter credentials.', '记录跟进情况，请勿填写任何登录凭据。')}/></label><button className="support-primary" disabled={busy||!reply.trim()}>{busy?t('Saving…','保存中…'):t('Save internal note','保存内部备注')}</button></form>}
  </section>;
  return <section className="support-chat-window" aria-label={t('Support conversation', '工单对话窗口')}>
    <header className="support-chat-header"><span className="support-chat-avatar"><MessageSquare size={20}/></span><div><h3>{admin ? t(`Chat with ${ticket.name}`, `与 ${ticket.name} 对话`) : t('Chat with support', '与管理员对话')}</h3><p>{t('Ticket messages · checked every 8 seconds', '工单消息 · 每 8 秒检查更新')}</p></div></header>
    <div className="support-chat-tabs" role="tablist" aria-label={t('Conversation views', '对话视图')}>
      {[['chat',MessageSquare,t('Conversation','对话')],['history',History,ticket.isLoginConversation?t('Login record','登录记录'):t('Submitted chat','已提交聊天记录')],['activity',ListChecks,t('Status history','处理记录')]].map(([id,Icon,label])=><button key={id} role="tab" id={`support-tab-${ticket.id}-${id}`} aria-controls={`support-panel-${ticket.id}-${id}`} aria-selected={tab===id} onClick={()=>setTab(id)}><Icon size={14}/>{label}{id==='chat' && <span>{messages.length}</span>}</button>)}
    </div>
    {syncError && <p className="support-sync-error" role="status">{t('Messages could not be refreshed. Retrying automatically; you can also use Refresh.', '暂时无法更新消息，将自动重试，也可点击刷新。')}</p>}
    <div role="tabpanel" id={`support-panel-${ticket.id}-${tab}`} aria-labelledby={`support-tab-${ticket.id}-${tab}`}>
      {tab==='chat' ? <>
        <div ref={log} className="support-chat-log" role="log" aria-label={t('Messages in this ticket', '此工单的消息')} aria-live="polite" onScroll={()=>{if(log.current){atBottom.current=log.current.scrollHeight-log.current.scrollTop-log.current.clientHeight<60;if(atBottom.current)setUnseen(false);}}}>
          <p className="support-chat-start"><ShieldCheck size={13}/>{t('Only the ticket owner and support administrators can view this conversation.', '仅此工单提交者和支持管理员可查看本对话。')}</p>
          <article className="support-chat-context"><strong>{ticket.isLoginConversation?t('Login conversation','登录会话'):t('Original request','原始问题')}</strong><p>{ticket.isLoginConversation?t('Automatically created at login. FAQ and support messages appear below.','登录时自动建立，FAQ 和客服沟通记录显示在下方。'):ticket.title}</p><button onClick={()=>setTab('history')}>{ticket.isLoginConversation?t('View login record','查看登录记录'):t('View submitted conversation','查看已提交的聊天记录')}</button></article>
          {!messages.length && <p className="support-chat-start">{t('No messages yet. Start the conversation below.', '暂无消息，可以在下方开始对话。')}</p>}
          {messages.map(event=><article key={event.id} className={`support-bubble ${!['FAQ','AI'].includes(event.role) && ((event.role==='Admin')===admin)?'outgoing':'incoming'}`}><header><strong>{event.name}</strong><span>{event.role==='AI'?t('Gemini · AI reply','Gemini · AI 回复'):event.role==='FAQ'?t('Preset FAQ · Not AI','预设 FAQ · 非 AI'):event.role==='Admin'?t('Support team','支持团队'):t('Student','学生')}</span></header><p>{event.text}</p><time dateTime={event.createdAt}>{date(event.createdAt)}</time></article>)}
        </div>
        {unseen && <button className="support-new-messages" onClick={jump}><ArrowDown size={14}/>{t('New messages','查看新消息')}</button>}
        <form className="support-chat-composer" onSubmit={e=>{e.preventDefault();atBottom.current=true;onSend();}}><label>{t('Write a reply','填写回复')}<textarea disabled={busy} value={reply} onChange={e=>setReply(e.target.value)} required maxLength={2000} rows={3} placeholder={t('Type a message to continue this conversation…','输入消息，继续沟通此问题…')}/></label><div><small>{t('No passwords, verification codes or API keys.','请勿填写密码、验证码或 API Key。')}</small><button className="support-primary" disabled={busy || !reply.trim()}><Send size={15}/>{busy?t('Sending…','发送中…'):t('Send message','发送消息')}</button></div></form>
      </> : tab==='history' ? <div className="support-submitted-history"><h4>{ticket.isLoginConversation?t('Login record','登录记录'):t('Conversation shared by the student','学生确认分享的对话')}</h4><p className="support-note">{ticket.isLoginConversation?t('Created automatically on successful sign-in. Refreshing the page does not create another record. Saved messages are on the Conversation tab; private study chats are not included.','成功登录时自动创建，刷新页面不会新增记录。已保存消息在“对话”标签中，不包含私人学习问答。'):t('This is the original text submitted with this ticket. “Help” entries are preset FAQ replies, not messages from an administrator. Other private chats are not included.','以下为用户随此工单确认提交的原始文本。“Help”代表预设 FAQ 答复，不是管理员回复。此处不包含其他私人聊天。')}</p><time>{date(ticket.createdAt)}</time><p className="support-transcript">{ticket.description}</p></div> : <div className="support-status-history"><h4>{t('Resolution timeline','处理时间线')}</h4><p>{t('Ticket created','工单已创建')} · {date(ticket.createdAt)}</p>{updates.map(event=><p key={event.id}><strong>{status(event.text)}</strong><br/>{event.name} · {date(event.createdAt)}</p>)}</div>}
    </div>
  </section>;
}
