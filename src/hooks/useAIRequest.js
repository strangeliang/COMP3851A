import { useCallback, useEffect, useRef, useState } from "react";
import { readWorkspaceState, writeWorkspaceState, workspaceSessionId } from "../services/workspaceSession";

const initialState = { status: "idle", data: null, error: "" };

export default function useAIRequest(scopeKey, kind = "qa") {
  const cacheKey = `${kind}:${scopeKey}`;
  const sessionId = workspaceSessionId();
  const [state, setState] = useState(() => readWorkspaceState(cacheKey, initialState));
  const scopeRef = useRef(scopeKey);
  const pendingRef = useRef(null);
  scopeRef.current = scopeKey;

  useEffect(() => {
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
    setState(readWorkspaceState(cacheKey, initialState));
    return () => {
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
    };
  }, [scopeKey, cacheKey, sessionId]);

  const cancel = useCallback(() => {
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
    setState((current) => ({ ...current, status: "idle", error: "" }));
  }, []);

  const run = useCallback(async (request) => {
    if (pendingRef.current) return null;
    const pending = { controller: new AbortController(), scopeKey };
    pendingRef.current = pending;
    writeWorkspaceState(cacheKey, initialState, sessionId);
    setState({ status: "loading", data: null, error: "" });
    try {
      const data = await request(pending.controller.signal);
      if (pendingRef.current !== pending || scopeRef.current !== scopeKey || pending.controller.signal.aborted) return null;
      const completed = { status: "success", data, error: "" };
      writeWorkspaceState(cacheKey, completed, sessionId);
      setState(completed);
      return data;
    } catch (error) {
      if (pendingRef.current === pending && scopeRef.current === scopeKey && error.name !== "AbortError") {
        const failed = { status: "error", data: null, error: error.message || "The request failed. Please try again." };
        writeWorkspaceState(cacheKey, failed, sessionId);
        setState(failed);
      }
      return null;
    } finally {
      if (pendingRef.current === pending) pendingRef.current = null;
    }
  }, [scopeKey, cacheKey, sessionId]);

  return { ...state, run, cancel, pending: state.status === "loading" };
}
