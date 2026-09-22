import { useState } from "react";
import { readWorkspaceState, writeWorkspaceState, workspaceSessionId } from "../services/workspaceSession";
export default function useWorkspaceState(key, initial) {
  const sessionId = workspaceSessionId();
  const identity = `${sessionId}:${key}`;
  const [snapshot, setSnapshot] = useState(() => ({ identity, value: readWorkspaceState(key, initial) }));
  let value = snapshot.value;
  if (snapshot.identity !== identity) {
    value = readWorkspaceState(key, initial);
    setSnapshot({ identity, value });
  }
  function update(next) {
    const previous = readWorkspaceState(key, initial);
    const resolved = typeof next === "function" ? next(previous) : next;
    writeWorkspaceState(key, resolved, sessionId);
    setSnapshot({ identity, value: resolved });
  }
  return [value, update];
}
