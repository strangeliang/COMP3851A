import { useCallback, useEffect, useRef, useState } from "react";

const initialState = { status: "idle", data: null, error: "" };

export default function useAIRequest(scopeKey) {
  const [state, setState] = useState(initialState);
  const scopeRef = useRef(scopeKey);
  const pendingRef = useRef(null);
  scopeRef.current = scopeKey;

  useEffect(() => {
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
    setState(initialState);
    return () => {
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
    };
  }, [scopeKey]);

  const cancel = useCallback(() => {
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
    setState((current) => ({ ...current, status: "idle", error: "" }));
  }, []);

  const run = useCallback(async (request) => {
    if (pendingRef.current) return null;
    const pending = { controller: new AbortController(), scopeKey };
    pendingRef.current = pending;
    setState({ status: "loading", data: null, error: "" });
    try {
      const data = await request(pending.controller.signal);
      if (pendingRef.current !== pending || scopeRef.current !== scopeKey || pending.controller.signal.aborted) return null;
      setState({ status: "success", data, error: "" });
      return data;
    } catch (error) {
      if (pendingRef.current === pending && scopeRef.current === scopeKey && error.name !== "AbortError") {
        setState({ status: "error", data: null, error: error.message || "The request failed. Please try again." });
      }
      return null;
    } finally {
      if (pendingRef.current === pending) pendingRef.current = null;
    }
  }, [scopeKey]);

  return { ...state, run, cancel, pending: state.status === "loading" };
}
