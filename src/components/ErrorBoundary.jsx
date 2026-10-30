import { Component } from 'react';
import './RecoveryPage.css';

function fallbackLanguage() {
  try {
    const stored = localStorage.getItem('study-language');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch { /* The error page remains available without browser storage. */ }
  try {
    if (document.documentElement.lang) return document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  } catch { /* The outer fallback also works before browser providers load. */ }
  return 'en';
}

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const zh = (this.props.language || fallbackLanguage()) === 'zh';
    return <main className="app-recovery-page" data-react-i18n lang={zh ? 'zh-CN' : 'en'}>
      <section className="app-recovery-card" aria-labelledby="app-error-title">
        <span className="app-recovery-mark" aria-hidden="true">!</span>
        <p className="app-recovery-eyebrow">Study Companion</p>
        <h1 id="app-error-title" tabIndex={-1} ref={node => node?.focus()}>{zh ? '页面暂时无法显示' : 'This page could not be displayed'}</h1>
        <p>{zh ? '请重试，或返回主页继续使用。已保存的学习记录不会因此被删除。' : 'Try again, or return home to continue. Your saved study records will not be deleted.'}</p>
        <div className="app-recovery-actions">
          <button type="button" onClick={() => this.setState({ failed: false })}>{zh ? '重试' : 'Try again'}</button>
          <a href={this.props.homeHref || '/'} onClick={this.props.onHome ? event => {
            event.preventDefault();
            this.setState({ failed: false });
            this.props.onHome();
          } : undefined}>{zh ? '返回主页' : 'Return home'}</a>
        </div>
      </section>
    </main>;
  }
}
