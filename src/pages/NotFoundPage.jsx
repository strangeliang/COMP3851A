import { Link } from 'react-router-dom';
import { useAppData } from '../state/AppDataContext';
import { useLanguage } from '../state/LanguageContext';
import '../components/RecoveryPage.css';

export default function NotFoundPage() {
  const { currentUser, isAuthLoading } = useAppData();
  const { language } = useLanguage();
  const zh = language === 'zh';
  const home = currentUser?.role === 'Admin' ? '/admin/support' : currentUser?.role === 'Student' ? '/student/dashboard' : '/';
  return <main className="app-recovery-page" data-react-i18n>
    <section className="app-recovery-card" aria-labelledby="not-found-title">
      <span className="app-recovery-mark" aria-hidden="true">404</span>
      <p className="app-recovery-eyebrow">Study Companion</p>
      <h1 id="not-found-title" tabIndex={-1} ref={node => node?.focus()}>{zh ? '找不到这个页面' : 'Page not found'}</h1>
      <p>{zh ? '链接可能已失效，或网址输入有误。请从主页重新选择需要的页面。' : 'This link may be outdated, or the address may be incorrect. Open your home page to continue.'}</p>
      <div className="app-recovery-actions">{isAuthLoading
        ? <p role="status">{zh ? '正在确认登录状态…' : 'Checking your session…'}</p>
        : <Link to={home}>{currentUser ? zh ? '返回主页' : 'Return home' : zh ? '前往登录' : 'Go to login'}</Link>}
      </div>
    </section>
  </main>;
}
