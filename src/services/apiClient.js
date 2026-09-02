export class APIError extends Error {
  constructor(message, code = "SERVICE_UNAVAILABLE", status = 0) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.status = status;
  }
}

export async function apiRequest(path, { method = "GET", body, signal, timeoutMs = 95000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    let data;
    try { data = await response.json(); } catch { throw new APIError("The service returned an invalid response. Please try again.", "INVALID_SERVER_RESPONSE", response.status); }
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("study-session-expired"));
      throw new APIError(data.message || "The request could not be completed.", data.code, response.status);
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (timedOut) throw new APIError("The request timed out. Please try again.", "REQUEST_TIMEOUT", 504);
    if (error instanceof APIError) throw error;
    throw new APIError("Cannot reach the service. Please try again shortly.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
