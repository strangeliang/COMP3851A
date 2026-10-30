import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, Inbox, CheckCircle2, Clock3, MessageSquare, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import SupportConversation from './SupportConversation';
import SupportRequestForm from './SupportRequestForm';
import { useAppData } from '../state/AppDataContext';
import { useLanguage } from '../state/LanguageContext';
import { listServerTickets, getServerTicket, replyServerTicket, updateServerTicket, requestHumanSupport, retryTicketEmail, ticketStatuses, ticketCategories } from '../services/ticketApiService';
import './SupportTickets.css';

const statusClass = { Open: 'open', 'In progress': 'progress', Resolved: 'resolved' };
function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function TicketDateInput({ label, value, onChange, min, max, zh }) {
  const id = useId();
  const textInput = useRef(null);
  const picker = useRef(null);
  const [pickerUnavailable, setPickerUnavailable] = useState(false);
  const t = (en, cn) => zh ? cn : en;
  const error = value && (!isISODate(value)
    ? t('Enter a valid date as YYYY-MM-DD.', '请输入有效日期，格式为年-月-日。')
    : min && value < min ? t(`Choose ${min} or a later date.`, `请选择 ${min} 或之后的日期。`)
    : max && value > max ? t(`Choose ${max} or an earlier date.`, `请选择 ${max} 或之前的日期。`) : '');
  function openPicker() {
    try {
      if (typeof picker.current?.showPicker !== 'function') throw new Error('Picker unavailable');
      picker.current.showPicker();
      setPickerUnavailable(false);
    } catch {
      setPickerUnavailable(true);
      textInput.current?.focus();
    }
  }
  return <div className="support-date-field">
    <label htmlFor={id}>{label}</label>
    <div className="support-date-control">
      <input ref={textInput} id={id} type="text" value={value} onChange={event => onChange(event.target.value)}
        aria-label={label} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        placeholder={t('YYYY-MM-DD', '年-月-日')} pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
        autoComplete="off" spellCheck={false} />
      <button type="button" onClick={openPicker} aria-label={t(`Choose date: ${label}`, `选择日期：${label}`)} title={t('Open calendar', '打开日历')}><CalendarDays size={17} aria-hidden="true" /></button>
      <input className="support-native-date" ref={picker} type="date" value={isISODate(value) ? value : ''}
        min={min} max={max} tabIndex={-1} aria-hidden="true" onChange={event => onChange(event.target.value)} />
    </div>
    <small id={`${id}-hint`} className="support-date-hint">{t('YYYY-MM-DD', '格式：年-月-日')}</small>
    {error && <small id={`${id}-error`} className="support-date-error" role="status">{error} {t('Filters stay unchanged until both dates are valid.', '两个日期均有效后才会更新筛选。')}</small>}
    {pickerUnavailable && <small className="support-date-hint" role="status">{t('Calendar unavailable. Type a date above, or clear it to remove this filter.', '日历暂不可用。请在上方输入日期，或清空以移除此筛选。')}</small>}
  </div>;
}
export default function SupportTickets(props) {
  const { currentUser } = useAppData();
  return currentUser ? <TicketInbox key={currentUser.id} user={currentUser} {...props} /> : null;
}
function TicketInbox({ user, onNewTicket, initialTicketId = null }) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const t = (en, cn) => zh ? cn : en;
  const admin = user.role === 'Admin';
  const [tickets, setTickets] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('All');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState({ from: '', to: '', appliedFrom: '', appliedTo: '' });
  function changeDate(name, value) {
    setDates(previous => {
      const next = { ...previous, [name]: value };
      if ((!next.from || isISODate(next.from)) && (!next.to || isISODate(next.to)) && (!next.from || !next.to || next.from <= next.to)) {
        next.appliedFrom = next.from; next.appliedTo = next.to;
      }
      return next;
    });
  }
  const [humanOnly, setHumanOnly] = useState(admin);
  const [newRequest, setNewRequest] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(admin);
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [selectedId, setSelectedId] = useState(initialTicketId);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState('Open');
  const [reload, setReload] = useState(0);
  const [syncError, setSyncError] = useState(false);
  const statusEdited = useRef(false);
  const listRequest = useRef(null);
  const olderRequest = useRef(null);
  const mounted = useRef(false);
  const writeLock = useRef(false);
  const mutationEpoch = useRef(0);
  const replyAttempt = useRef(null);
  const reopenAttempt = useRef(null);
  const statusLabel = (value) => ({ Open: t('Open', '待处理'), 'In progress': t('In progress', '处理中'), Resolved: t('Resolved', '已解决'), All: t('All tickets', '全部工单') })[value] || value;
  const categoryLabel = (value) => ({ account: t('Account', '账号'), upload: t('Upload', '上传'), quiz: t('Quiz', '测验'), review: t('Study History', '学习历史'), other: t('Other', '其他') })[value] || value;
  const date = (value) => value ? new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const filters = useMemo(() => ({
    q: search.trim(), status: filter === 'All' ? undefined : filter,
    category: category === 'All' ? undefined : category, from: dates.appliedFrom, to: dates.appliedTo,
    hideEmpty, needsReply: needsReplyOnly, humanOnly, sort: humanOnly ? 'requested' : sort,
  }), [search, filter, category, dates.appliedFrom, dates.appliedTo, hideEmpty, needsReplyOnly, humanOnly, sort]);
  const refresh = useCallback(async (silent = false) => {
    if (olderRequest.current) return;
    listRequest.current?.abort();
    const controller = new AbortController(); listRequest.current = controller;
    if (!silent) setLoading(true); setError('');
    try {
      const result = await listServerTickets(controller.signal, null, filters);
      if (!controller.signal.aborted && mounted.current) {
        setTickets(result.tickets);
        setHasMore(result.hasMore); setNextCursor(result.nextCursor || null);
        setLoaded(true);
      }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(e.message); }
    finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }, [filters]);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  useEffect(() => {
    olderRequest.current?.abort(); olderRequest.current=null; setLoadingMore(false);
    setTickets([]);setNextCursor(null);setHasMore(false);setLoaded(false);
    mounted.current = true; refresh();
    return () => { mounted.current = false; listRequest.current?.abort(); olderRequest.current?.abort(); };
  }, [refresh]);
  async function loadOlder() {
    if (!nextCursor || olderRequest.current || busy) return;
    listRequest.current?.abort(); setLoading(false);
    const controller = new AbortController(); olderRequest.current = controller;
    setLoadingMore(true); setError('');
    try {
      const result = await listServerTickets(controller.signal, nextCursor, filters);
      if (!controller.signal.aborted && mounted.current) {
        setTickets(previous => [...new Map([...previous, ...result.tickets].map(ticket => [ticket.id, ticket])).values()]);
        setHasMore(result.hasMore); setNextCursor(result.nextCursor || null);
      }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(e.message); }
    finally { if (olderRequest.current === controller) { olderRequest.current = null; if (mounted.current) setLoadingMore(false); } }
  }
  useEffect(() => {
    if (!admin) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || writeLock.current || tickets.length > 200 || (typeof document !== 'undefined' && document.hidden)) return;
      running = true;
      try { await refresh(true); } finally { running = false; }
    }, 8000);
    return () => clearInterval(timer);
  }, [admin, refresh, tickets.length]);
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
      } else if (type === 'reopen') {
        if (reopenAttempt.current?.id !== selected.id) reopenAttempt.current = { id: selected.id, clientId: crypto.randomUUID() };
        result = await requestHumanSupport(selected.id, reopenAttempt.current.clientId);
        reopenAttempt.current = null;
      } else if (type === 'email') result = await retryTicketEmail(selected.id);
      else result = await updateServerTicket(selected.id, nextStatus, selected.version);
      if (!mounted.current) return;
      setSelected(result.ticket); setNextStatus(result.ticket.status);
      statusEdited.current = false;
      setTickets((items) => items.map((item) => item.id === result.ticket.id ? result.ticket : item));
      if (type === 'reply') { setReply(''); replyAttempt.current = null; }
      setNotice(type === 'email' ? t('Notification queued for retry. This does not confirm delivery.', '已加入邮件重试队列，不代表已经送达。') : type === 'reply' && admin && !result.ticket.isRecoveryRequest ? t('Reply saved. Email notification is queued; check its status below.', '回复已保存，邮件通知已加入队列，可在下方查看状态。') : t('Saved to the server.', '已保存到服务器。')); await latestRefresh.current();
    } catch (e) { if (mounted.current) setDetailError(e.message); }
    finally { writeLock.current = false; if (mounted.current) setBusy(false); }
  }
  function choose(id) { if (writeLock.current || busy || id === selectedId) return; statusEdited.current=false; setSelectedId(id); setReply(''); replyAttempt.current = null; setNotice(''); }
  const listed = tickets.filter((item) => (!hideEmpty || item.hasMessages !== false) && (!needsReplyOnly || item.needsReply) && (!humanOnly || item.humanSupport === 'Waiting') && (filter === 'All' || item.status === filter) && (category === 'All' || item.category === category))
    .sort((a,b) => (humanOnly ? (a.humanRequestedAt || a.createdAt).localeCompare(b.humanRequestedAt || b.createdAt) : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id));
  const icons = [Inbox, Clock3, MessageSquare, CheckCircle2];
  const badge = (status) => <span className={`support-badge ${statusClass[status]}`}>{statusLabel(status)}</span>;
  return <div data-react-i18n className={`support-tickets ${admin ? 'support-admin' : 'support-student'}`}>
    {admin && <header className="support-header"><div><span className="support-eyebrow">{t('STUDENT SUPPORT', '学生支持')}</span><h1>{t('Support Tickets', '问题工单')}</h1><p>{t('See what needs attention. Keep students informed as you resolve their issues.', '查看待处理问题，通过回复和状态更新向学生说明处理进度。')}</p></div><span className="support-secure"><ShieldCheck size={16} />{t('Admin workspace', '管理员工作区')}</span></header>}
    <div className="support-toolbar"><p className="support-note">{t('Human support is asynchronous: you can leave and return to this ticket. Staff replies queue an email to the verified account address. Check your inbox/spam or this history; email delivery is not guaranteed. Open conversations refresh every 8 seconds.', '人工支持采用异步工单，无需一直在线等待。管理员回复会排队通知已验证的账户邮箱；请查看收件箱、垃圾邮件或工单历史，邮件不保证送达。打开的对话每 8 秒更新。')}</p><button disabled={loading || busy || detailLoading} onClick={() => { refresh(); setReload((n) => n + 1); }}><RefreshCw size={15} />{t('Refresh', '刷新')}</button>{!admin && onNewTicket && <button onClick={onNewTicket}>{t('Current conversation', '本次会话')}</button>}{!admin && <button disabled={busy} onClick={() => setNewRequest(true)}>{t('New support request', '提交新问题')}</button>}</div>
    {newRequest && <SupportRequestForm zh={zh} onCancel={() => setNewRequest(false)} onCreated={ticket => { setNewRequest(false); choose(ticket.id); setNotice(t('Request submitted. You do not need to stay online.', '申请已提交，无需在线等待。')); latestRefresh.current(); }} />}
    {admin && humanOnly && <p className="support-notice">{t('Waiting queue: earliest human-support request first. Uncheck the waiting queue to search all tickets, including in-progress and resolved requests.', '待处理队列：按申请人工时间从早到晚排列。取消勾选待处理队列，可检索包括处理中和已解决的全部工单。')}</p>}
    {admin && <div className="support-stats" aria-label={t('Loaded ticket counts', '已加载工单统计')}>{['All', ...ticketStatuses].map((status, i) => { const Icon = icons[i]; return <button key={status} className={`support-stat ${filter === status ? 'active' : ''}`} aria-pressed={filter === status} onClick={() => { setFilter(status); setHumanOnly(false); }}><Icon size={20} /><span>{statusLabel(status)}</span><strong>{loaded ? status === 'All' ? tickets.length : tickets.filter((x) => x.status === status).length : '—'}</strong></button>; })}</div>}
    {error && <p className="support-error" role="alert">{error} <button onClick={() => refresh()}>{t('Retry', '重试')}</button></p>}
    <p className="support-note">{t('Search and filters cover all saved conversations and replies. Counts show loaded results only. Refresh returns to the first matching page.', '搜索和筛选覆盖全部已保存会话及回复；统计仅显示已加载结果。刷新会返回首批匹配结果。')}</p>
    {hasMore && <p className="support-note">{t('More matching conversations are available below.', '下方可加载更多匹配会话。')}</p>}
    <div className="support-workspace"><section className="support-list-panel" aria-label={t('Ticket list', '工单列表')}>
      <div className="support-filters"><label className="support-search"><span>{t('Search tickets', '搜索工单')}</span><div><Search size={16} /><input type="search" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Conversation text, student or ticket ID', '聊天正文、学生或工单编号')} /></div></label><div className="support-filter-pair"><label>{t('Status', '状态')}<select value={filter} onChange={(e) => { setFilter(e.target.value); setHumanOnly(false); }}>{['All', ...ticketStatuses].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>{t('Category', '类别')}<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="All">{t('All categories', '全部类别')}</option>{ticketCategories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label></div></div>
      <div className="support-filter-pair support-date-filters">
        <TicketDateInput label={t('Created from (UTC)', '创建日期从（UTC）')} value={dates.from} onChange={value => changeDate('from', value)} max={isISODate(dates.to) ? dates.to : undefined} zh={zh} />
        <TicketDateInput label={t('Created through (UTC)', '创建日期至（UTC）')} value={dates.to} onChange={value => changeDate('to', value)} min={isISODate(dates.from) ? dates.from : undefined} zh={zh} />
      </div>
      {admin && <div className="support-filters"><label><input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)}/>{t('Hide empty login conversations','隐藏空登录会话')}</label><label><input type="checkbox" checked={needsReplyOnly} onChange={e=>setNeedsReplyOnly(e.target.checked)}/>{t('Awaiting staff reply','等待管理员回复')}</label><label>{t('Sort','排序')}<select disabled={humanOnly} value={humanOnly ? 'requested' : sort} onChange={e=>setSort(e.target.value)}>{humanOnly && <option value="requested">{t('Earliest human request first','最早申请人工优先')}</option>}<option value="newest">{t('Recently updated','最近更新')}</option><option value="oldest">{t('Oldest first','最早提交优先')}</option></select></label></div>}
      {admin && <label className="support-human-filter"><input type="checkbox" checked={humanOnly} onChange={e=>{setHumanOnly(e.target.checked); if(e.target.checked){setFilter('All');setNeedsReplyOnly(false);}}}/>{t('Human support waiting queue','人工待处理队列')}</label>}
      <div className="support-list-heading"><h2>{t('Inbox', '收件箱')}</h2><span>{loaded ? listed.length : '—'}</span></div>
      {loading && <p role="status" className="support-empty">{t('Loading tickets…', '正在加载工单…')}</p>}
      {!loading && loaded && !listed.length && <div className="support-empty"><Inbox size={28} /><h3>{t('No tickets found', '暂无工单')}</h3><p>{tickets.length ? t('Try a different search or filter.', '请调整搜索词或筛选条件。') : t('Submitted tickets will appear here.', '提交的工单将在这里显示。')}</p></div>}
      <div className="support-list">{listed.map((item) => <button disabled={busy} type="button" className={`support-ticket-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => choose(item.id)}><div className="support-row-top">{badge(item.status)}<small>{categoryLabel(item.category)}</small>{item.needsReply && <small>{t('Awaiting reply','待回复')}</small>}</div><strong>{item.title}</strong><span className="support-id">{t('Ticket ID: ', '工单编号：')}{item.id}</span><span className="support-row-excerpt">{item.description}</span><div className="support-row-meta"><span>{item.name}</span><small>{humanOnly ? t('Requested: ', '申请时间：') : ''}{date(humanOnly ? item.humanRequestedAt : item.updatedAt)}</small></div></button>)}</div>
      {hasMore && <button type="button" className="support-load-older" disabled={busy || loadingMore || !nextCursor} onClick={loadOlder}>{loadingMore ? t('Loading older conversations…', '正在加载较早会话…') : t('Load older conversations', '加载较早会话')}</button>}
    </section><section className="support-detail" aria-label={t('Ticket details', '工单详情')}>
      {detailError && <p role="alert" className="support-error">{detailError} <button disabled={busy} onClick={() => setReload((n) => n + 1)}>{t('Refresh details', '刷新详情')}</button></p>}
      {notice && <p role="status" className="support-notice">{notice}</p>}
      {detailLoading ? <p role="status" className="support-empty">{t('Loading details…', '正在加载详情…')}</p> : !selected ? <div className="support-empty support-detail-empty"><MessageSquare size={38} /><h2>{t('Select a ticket', '选择一条工单')}</h2><p>{t('Read the issue, follow the conversation and check its resolution status.', '查看问题详情、沟通记录和解决状态。')}</p></div> : <>
        <div className="support-detail-heading"><div className="support-row-top">{badge(selected.status)}<span>{categoryLabel(selected.category)}</span></div><h2>{selected.title}</h2><p className="support-id">{selected.id}</p><dl className="support-meta"><div><dt>{t('Submitted by', '提交人')}</dt><dd>{selected.name}</dd></div><div><dt>{t('Created', '提交时间')}</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>{t('Last updated', '更新时间')}</dt><dd>{date(selected.updatedAt)}</dd></div>{selected.resolvedAt && <div><dt>{t('Resolved', '解决时间')}</dt><dd>{date(selected.resolvedAt)}</dd></div>}</dl></div>
        {selected.humanSupport && <p role="status" className="support-notice">{t('Human support: ', '人工客服：')}{({Waiting:t('Waiting','等待人工'),'In progress':t('In progress','处理中'),Resolved:t('Resolved','已解决')})[selected.humanSupport]}</p>}
        {!admin && selected.status === 'Resolved' && <button disabled={busy} onClick={() => perform('reopen')}>{t('Reopen this issue', '重新打开此问题')}</button>}
        {admin && !selected.isRecoveryRequest && selected.replies.some(e => ['failed','skipped'].includes(e.emailState)) && <button disabled={busy} onClick={() => perform('email')}>{t('Retry failed/skipped email notifications', '重试失败或跳过的邮件通知')}</button>}
        {admin && <form className="support-status-editor" onSubmit={(e) => { e.preventDefault(); perform('status'); }}><label>{t('Resolution status', '处理状态')}<select disabled={busy} value={nextStatus} onChange={(e) => { statusEdited.current=true; setNextStatus(e.target.value); }}>{ticketStatuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><button className="support-primary" disabled={busy || nextStatus === selected.status}>{t('Update status', '更新状态')}</button></form>}
        <SupportConversation key={selected.id} ticket={selected} admin={admin} zh={zh} reply={reply} setReply={setReply} busy={busy} onSend={()=>perform('reply')} syncError={syncError}/>
      </>}
    </section></div>
    {!admin && <p className="support-note">{t('Older browser-only tickets have not been uploaded automatically. Re-submit an unresolved issue after reviewing its content.', '旧的本地工单不会自动上传。若问题仍未解决，请检查内容后重新提交。')}</p>}
  </div>;
}
