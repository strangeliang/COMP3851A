import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/apiClient';

export default function useFlashcardProgress({ recordId, userId, ensureSaved }) {
  const identity = JSON.stringify([String(userId ?? ''), recordId || '']);
  const active = useRef(null);
  const saveLock = useRef(false);
  const ensureRef = useRef(ensureSaved);
  ensureRef.current = ensureSaved;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ identity, mastered: [], loading: Boolean(recordId), saving: false, ready: false, error: '' });
  const current = state.identity === identity ? state : { identity, mastered: [], loading: Boolean(recordId), saving: false, ready: false, error: '' };
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const token = { identity, controller: new AbortController(), version: 0, loading: false };
    active.current = token;
    saveLock.current = false;
    async function load() {
      if (!recordId || saveLock.current || token.loading) return;
      token.loading = true;
      const version = ++token.version;
      setState(previous => ({ identity, mastered: previous.identity === identity ? previous.mastered : [], loading: true, saving: false, ready: false, error: '' }));
      try {
        await ensureRef.current?.();
        if (active.current !== token || version !== token.version || token.controller.signal.aborted) return;
        const result = await apiRequest(`/history/${encodeURIComponent(recordId)}/flashcards-progress`, { signal: token.controller.signal });
        if (active.current !== token || version !== token.version || saveLock.current) return;
        if (!Array.isArray(result.mastered)) throw new Error('The saved card progress could not be read.');
        setState({ identity, mastered: result.mastered.map(String), loading: false, saving: false, ready: true, error: '' });
      } catch (error) {
        if (active.current === token && version === token.version && !token.controller.signal.aborted) setState(previous => ({ ...previous, loading: false, ready: false, error: error.message }));
      } finally { if (version === token.version) token.loading = false; }
    }
    load();
    const refresh = () => { if (!saveLock.current && !currentRef.current.loading) load(); };
    window.addEventListener('focus', refresh);
    return () => {
      token.controller.abort();
      if (active.current === token) active.current = null;
      window.removeEventListener('focus', refresh);
    };
  }, [identity, recordId, retry]);

  async function toggle(cardId) {
    const token = active.current;
    if (!token || token.identity !== identity || token.loading || saveLock.current || !currentRef.current.ready) return;
    const version = ++token.version;
    const mastered = !currentRef.current.mastered.includes(String(cardId));
    saveLock.current = true;
    setState(previous => ({ ...previous, saving: true, error: '' }));
    try {
      const result = await apiRequest(`/history/${encodeURIComponent(recordId)}/flashcards-progress`, {
        method: 'PATCH', body: { cardId: String(cardId), mastered }, signal: token.controller.signal,
      });
      if (active.current !== token || version !== token.version) return;
      if (!Array.isArray(result.mastered)) throw new Error('The updated card progress could not be confirmed.');
      setState({ identity, mastered: result.mastered.map(String), loading: false, saving: false, ready: true, error: '' });
    } catch (error) {
      if (active.current === token && !token.controller.signal.aborted) setState(previous => ({ ...previous, saving: false, error: error.message }));
    } finally { if (active.current === token) saveLock.current = false; }
  }

  return { ...current, toggle, reload: () => setRetry(value => value + 1) };
}
