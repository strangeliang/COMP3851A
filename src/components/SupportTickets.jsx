import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox, CheckCircle2, Clock3, MessageSquare, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import SupportConversation from './SupportConversation';
import { useAppData } from '../state/AppDataContext';
import { useLanguage } from '../state/LanguageContext';
import { listServerTickets, getServerTicket, replyServerTicket, updateServerTicket, ticketStatuses, ticketCategories } from '../services/ticketApiService';
import './SupportTickets.css';

const statusClass = { Open: 'open', 'In progress': 'progress', Resolved: 'resolved' };
export default function SupportTickets(props) {
  const { currentUser } = useAppData();
  return currentUser ? <TicketInbox key={currentUser.id} user={currentUser} {...props} /> : null;
}
function TicketInbox({ user, onNewTicket }) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const t = (en, cn) => zh ? cn : en;
  const admin = user.role === 'Admin';
  const [tickets, setTickets] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('All');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState('Open');
  const [reload, setReload] = useState(0);
  const [syncError, setSyncError] = useState(false);
  const statusEdited = useRef(false);
  const listRequest = useRef(null);
  const mounted = useRef(false);
  const writeLock = useRef(false);
  const mutationEpoch = useRef(0);
  const replyAttempt = useRef(null);
  const statusLabel = (value) => ({ Open: t('Open', '待处理'), 'In progress': t('In progress', '处理中'), Resolved: t('Resolved', '已解决'), All: t('All tickets', '全部工单') })[value] || value;
  const categoryLabel = (value) => ({ account: t('Account', '账号'), upload: t('Upload', '上传'), quiz: t('Quiz', '测验'), review: t('Study History', '学习历史'), other: t('Other', '其他') })[value] || value;
  const date = (value) => value ? new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const refresh = useCallback(async (silent = false) => {
    listRequest.current?.abort();
    const controller = new AbortController(); listRequest.current = controller;
    if (!silent) setLoading(true); setError('');
    try {
      const result = await listServerTickets(controller.signal);
      if (!controller.signal.aborted && mounted.current) { setTickets(result.tickets); setHasMore(result.hasMore); setLoaded(true); }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(e.message); }
    finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; refresh();
    return () => { mounted.current = false; listRequest.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!admin) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || writeLock.current || (typeof document !== 'undefined' && document.hidden)) return;
      running = true;
      try { await refresh(true); } finally { running = false; }
    }, 8000);
    return () => clearInterval(timer);
  }, [admin, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null); setDetailError('');
    if (!selectedId) { setDetailLoading(false); return () => controller.abort(); }
    setDetailLoading(true);
    getServerTicket(selectedId, controller.signal).then(({ ticket }) => {
      if (!controller.signal.aborted) { setSelected(ticket); setNextStatus(ticket.status); }
    }).catch((e) => { if (!controller.signal.aborted) setDetailError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, reload]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    let controller;
    let running = false;
    setSyncError(false);
    const timer = setInterval(async () => {
      if (running || writeLock.current || (typeof document !== 'undefined' && document.hidden)) return;
      running = true; controller = new AbortController();
      const epoch = mutationEpoch.current;
      try {
        const {ticket} = await getServerTicket(selectedId, controller.signal);
        if (cancelled || writeLock.current || epoch !== mutationEpoch.current) return;
        setSelected(old => old && ticket.version >= old.version ? ticket : old);
        if (!statusEdited.current) setNextStatus(ticket.status);
        setTickets(items => items.map(item => item.id===ticket.id && ticket.version>=item.version ? ticket : item));
        setSyncError(false);
      } catch { if (!cancelled) setSyncError(true); }
      finally { running = false; }
    }, 8000);
    return () => {cancelled=true;clearInterval(timer);controller?.abort();};
  }, [selectedId]);
  async function perform(type) {
    if (writeLock.current || !selected) return;
    mutationEpoch.current++;
    writeLock.current = true; setBusy(true); setDetailError(''); setNotice('');
    try {
      let result;
      if (type === 'reply') {
        if (!replyAttempt.current || replyAttempt.current.text !== reply || replyAttempt.current.id !== selected.id)
          replyAttempt.current = { text: reply, id: selected.id, clientId: crypto.randomUUID() };
        result = await replyServerTicket(selected.id, reply, replyAttempt.current.clientId);
      } else result = await updateServerTicket(selected.id, nextStatus, selected.version);
      if (!mounted.current) return;
      setSelected(result.ticket); setNextStatus(result.ticket.status);
      statusEdited.current = false;
      setTickets((items) => items.map((item) => item.id === result.ticket.id ? result.ticket : item));
      if (type === 'reply') { setReply(''); replyAttempt.current = null; }
      setNotice(t('Saved to the server.', '已保存到服务器。')); await refresh();
    } catch (e) { if (mounted.current) setDetailError(e.message); }
    finally { writeLock.current = false; if (mounted.current) setBusy(false); }
  }
  function choose(id) { if (busy) return; statusEdited.current=false; setSelectedId(id); setReply(''); replyAttempt.current = null; setNotice(''); }
  const listed = tickets.filter((item) => (filter === 'All' || item.status === filter) && (category === 'All' || item.category === category) && `${item.id} ${item.title} ${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const icons = [Inbox, Clock3, MessageSquare, CheckCircle2];
  const badge = (status) => <span className={`support-badge ${statusClass[status]}`}>{statusLabel(status)}</span>;
  return <div data-react-i18n className={`support-tickets ${admin ? 'support-admin' : 'support-student'}`}>
    {admin && <header className="support-header"><div><span className="support-eyebrow">{t('STUDENT SUPPORT', '学生支持')}</span><h1>{t('Support Tickets', '问题工单')}</h1><p>{t('See what needs attention. Keep students informed as you resolve their issues.', '查看待处理问题，通过回复和状态更新向学生说明处理进度。')}</p></div><span className="support-secure"><ShieldCheck size={16} />{t('Admin workspace', '管理员工作区')}</span></header>}
    <div className="support-toolbar"><p className="support-note">{t('Each student login creates a support conversation, even before any message. New conversations and open chats are checked every 8 seconds. No email notifications.', '每次学生登录自动建立客服会话，即使尚未发送消息。管理端新会话及打开的对话每 8 秒检查更新，暂不发送邮件。')}</p><button disabled={loading || busy || detailLoading} onClick={() => { refresh(); setReload((n) => n + 1); }}><RefreshCw size={15} />{t('Refresh', '刷新')}</button>{!admin && onNewTicket && <button onClick={onNewTicket}>{t('Current conversation', '本次会话')}</button>}</div>
    {admin && <div className="support-stats" aria-label={t('Loaded ticket counts', '已加载工单统计')}>{['All', ...ticketStatuses].map((status, i) => { const Icon = icons[i]; return <button key={status} className={`support-stat ${filter === status ? 'active' : ''}`} aria-pressed={filter === status} onClick={() => setFilter(status)}><Icon size={20} /><span>{statusLabel(status)}</span><strong>{loaded ? status === 'All' ? tickets.length : tickets.filter((x) => x.status === status).length : '—'}</strong></button>; })}</div>}
    {error && <p className="support-error" role="alert">{error} <button onClick={refresh}>{t('Retry', '重试')}</button></p>}
    {hasMore && <p className="support-note">{t('Showing the latest 200 tickets. Counts and filters apply to these loaded tickets.', '显示最新 200 条工单；统计和筛选仅针对已加载记录。')}</p>}
    <div className="support-workspace"><section className="support-list-panel" aria-label={t('Ticket list', '工单列表')}>
      <div className="support-filters"><label className="support-search"><span>{t('Search tickets', '搜索工单')}</span><div><Search size={16} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Title, student or ticket ID', '标题、学生或工单编号')} /></div></label><div className="support-filter-pair"><label>{t('Status', '状态')}<select value={filter} onChange={(e) => setFilter(e.target.value)}>{['All', ...ticketStatuses].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>{t('Category', '类别')}<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="All">{t('All categories', '全部类别')}</option>{ticketCategories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label></div></div>
      <div className="support-list-heading"><h2>{t('Inbox', '收件箱')}</h2><span>{loaded ? listed.length : '—'}</span></div>
      {loading && <p role="status" className="support-empty">{t('Loading tickets…', '正在加载工单…')}</p>}
      {!loading && loaded && !listed.length && <div className="support-empty"><Inbox size={28} /><h3>{t('No tickets found', '暂无工单')}</h3><p>{tickets.length ? t('Try a different search or filter.', '请调整搜索词或筛选条件。') : t('Submitted tickets will appear here.', '提交的工单将在这里显示。')}</p></div>}
      <div className="support-list">{listed.map((item) => <button disabled={busy} type="button" className={`support-ticket-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => choose(item.id)}><div className="support-row-top">{badge(item.status)}<small>{categoryLabel(item.category)}</small></div><strong>{item.title}</strong><span className="support-row-excerpt">{item.description}</span><div className="support-row-meta"><span>{item.name}</span><small>{date(item.updatedAt)}</small></div></button>)}</div>
    </section><section className="support-detail" aria-label={t('Ticket details', '工单详情')}>
      {detailError && <p role="alert" className="support-error">{detailError} <button disabled={busy} onClick={() => setReload((n) => n + 1)}>{t('Refresh details', '刷新详情')}</button></p>}
      {notice && <p role="status" className="support-notice">{notice}</p>}
      {detailLoading ? <p role="status" className="support-empty">{t('Loading details…', '正在加载详情…')}</p> : !selected ? <div className="support-empty support-detail-empty"><MessageSquare size={38} /><h2>{t('Select a ticket', '选择一条工单')}</h2><p>{t('Read the issue, follow the conversation and check its resolution status.', '查看问题详情、沟通记录和解决状态。')}</p></div> : <>
        <div className="support-detail-heading"><div className="support-row-top">{badge(selected.status)}<span>{categoryLabel(selected.category)}</span></div><h2>{selected.title}</h2><p className="support-id">{selected.id}</p><dl className="support-meta"><div><dt>{t('Submitted by', '提交人')}</dt><dd>{selected.name}</dd></div><div><dt>{t('Created', '提交时间')}</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>{t('Last updated', '更新时间')}</dt><dd>{date(selected.updatedAt)}</dd></div>{selected.resolvedAt && <div><dt>{t('Resolved', '解决时间')}</dt><dd>{date(selected.resolvedAt)}</dd></div>}</dl></div>
        {admin && <form className="support-status-editor" onSubmit={(e) => { e.preventDefault(); perform('status'); }}><label>{t('Resolution status', '处理状态')}<select disabled={busy} value={nextStatus} onChange={(e) => { statusEdited.current=true; setNextStatus(e.target.value); }}>{ticketStatuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><button className="support-primary" disabled={busy || nextStatus === selected.status}>{t('Update status', '更新状态')}</button></form>}
        <SupportConversation key={selected.id} ticket={selected} admin={admin} zh={zh} reply={reply} setReply={setReply} busy={busy} onSend={()=>perform('reply')} syncError={syncError}/>
      </>}
    </section></div>
    {!admin && <p className="support-note">{t('Older browser-only tickets have not been uploaded automatically. Re-submit an unresolved issue after reviewing its content.', '旧的本地工单不会自动上传。若问题仍未解决，请检查内容后重新提交。')}</p>}
  </div>;
}
