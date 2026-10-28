import { useEffect, useRef, useState } from 'react';
import { createServerTicket, ticketCategories } from '../services/ticketApiService';
import './SupportTickets.css';

export default function SupportRequestForm({ zh = false, onCreated, onCancel }) {
  const t = (en, cn) => zh ? cn : en;
  const [form, setForm] = useState({ category: 'other', title: '', problem: '', steps: '', environment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const field = (key, value) => setForm(old => ({ ...old, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    if (!form.title.trim() || form.problem.trim().length < 10) {
      setError(t('Enter a title and describe the problem in at least 10 characters.', '请填写标题，并用至少 10 个字符描述问题。')); return;
    }
    const description = [form.problem.trim(), form.steps.trim() && `Steps / 操作步骤:\n${form.steps.trim()}`,
      form.environment.trim() && `Page, browser, device / 页面、浏览器、设备:\n${form.environment.trim()}`].filter(Boolean).join('\n\n');
    if (description.length > 2000) { setError(t('Keep the combined details within 2,000 characters.', '问题详情合计请勿超过 2,000 个字符。')); return; }
    const payload = { category: form.category, title: form.title.trim(), description };
    const key = JSON.stringify(payload);
    if (attempt.current?.key !== key) attempt.current = { key, clientId: crypto.randomUUID() };
    locked.current = true; setBusy(true); setError('');
    try {
      const { ticket } = await createServerTicket({ ...payload, clientId: attempt.current.clientId });
      if (mounted.current) onCreated(ticket);
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  return <form className="support-tickets support-request-form" onSubmit={submit}>
    <h2>{t('Request human support', '申请人工帮助')}</h2>
    <p>{t('This is a support request, not a live chat. Describe one problem per ticket. Your AI conversation stays in its original history.', '这是异步工单，不是实时人工聊天。一张工单描述一个问题，AI 对话仍保留在原历史记录中。')}</p>
    <p>{t('You can leave after submitting. We will attempt to email your verified account address when staff reply; you can also check the ticket history. Never include passwords, codes or API keys.', '提交后无需在线等待。管理员回复后，系统会尝试向已验证的账户邮箱发送通知，也可在工单历史查看。请勿填写密码、验证码或 API Key。')}</p>
    <fieldset disabled={busy}>
      <label>{t('Category', '类别')}<select name="category" value={form.category} onChange={e => field('category', e.target.value)}>{ticketCategories.map(c => <option key={c} value={c}>{({account:t('Account','账号'),upload:t('Upload','上传'),quiz:t('Quiz','测验'),review:t('Study History','学习历史'),other:t('Other','其他')})[c]}</option>)}</select></label>
      <label>{t('Problem title', '问题标题')}<input name="title" required maxLength={100} value={form.title} onChange={e => field('title', e.target.value)} /></label>
      <label>{t('What happened, and what did you expect?', '发生了什么？你希望的结果是什么？')}<textarea name="problem" required minLength={10} maxLength={1400} rows={4} value={form.problem} onChange={e => field('problem', e.target.value)} /></label>
      <label>{t('Steps to reproduce (optional)', '复现步骤（选填）')}<textarea name="steps" maxLength={350} rows={2} value={form.steps} onChange={e => field('steps', e.target.value)} /></label>
      <label>{t('Page, browser and device (optional; no private links)', '页面、浏览器和设备（选填，请勿附私密链接）')}<input name="environment" maxLength={150} value={form.environment} onChange={e => field('environment', e.target.value)} /></label>
      {error && <p className="support-error" role="alert">{error}</p>}
      <div className="support-actions"><button type="button" onClick={onCancel}>{t('Cancel','取消')}</button><button className="support-primary" type="submit">{busy ? t('Submitting…','提交中…') : t('Submit support request','提交人工工单')}</button></div>
    </fieldset>
  </form>;
}
