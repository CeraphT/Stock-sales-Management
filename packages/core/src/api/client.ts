import { getAuthStore } from "../auth/store";
import type { AuthResponse, RefreshRequest } from "./types/auth";

// Each app supplies its own base URL at startup via configureApi() — mobile
// needs `adb reverse tcp:5080 tcp:5080` (same convention as the MAUI
// client's PharmaStockApiClient.ApiBaseAddress) since it runs on a device/
// emulator; desktop's Tauri webview can reach `localhost` directly.
let API_BASE_URL = "http://localhost:5080";

export function configureApi(baseUrl: string) {
  API_BASE_URL = baseUrl;
}

// Invoked when the server signals a remote wipe for this device (see the
// refresh flow below). Apps with a local mirror inject a wiper here at startup
// (mobile/desktop → clearLocalData()); the online-only web client leaves it
// unset. Kept out of client.ts's imports so the HTTP layer stays DB-free.
let onRemoteWipe: (() => Promise<void>) | null = null;

export function configureOnRemoteWipe(handler: () => Promise<void>) {
  onRemoteWipe = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Concurrent requests that all hit a 401 at once must not each fire their
// own refresh call (the refresh token rotates on every use — a second
// concurrent refresh would invalidate the first's new token). Shared
// in-flight promise dedupes them onto one refresh, mirroring SyncService's
// same-shaped guard against concurrent sync calls on the MAUI client.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const { deviceId, refreshToken } = getAuthStore().getState();
  if (!refreshToken) return false;

  const body: RefreshRequest = { deviceId, refreshToken };
  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Refresh token itself is dead (expired/revoked/already-rotated-away) —
    // nothing left to do but sign the user out.
    getAuthStore().getState().clear();
    return false;
  }

  const payload = await response.json();

  // Remote wipe: the server is telling this device to erase its local mirror
  // and sign out. Reversible from the admin console (Unblock clears the flag),
  // after which a fresh login re-syncs from the server.
  if (payload?.wipeRequested === true) {
    try {
      await onRemoteWipe?.();
    } catch {
      /* never let a wipe failure trap the app; sign out regardless */
    }
    getAuthStore().getState().clear();
    return false;
  }

  const auth = payload as AuthResponse;
  getAuthStore()
    .getState()
    .setSession({
      token: auth.token,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
      user: auth.user,
      companyId: auth.companyId,
    });
  return true;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Query string params, appended as ?key=value (skips null/undefined). */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the Authorization header — only the pre-auth endpoints need this (login/onboard/join). */
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Core request function. On a 401 (and only if this request was sent with
 * an auth header in the first place — a 401 on a skipAuth call means bad
 * credentials, not an expired token), attempts exactly one refresh-and-
 * retry before giving up.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, skipAuth = false } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!skipAuth) {
      const token = getAuthStore().getState().token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await doFetch();

  if (response.status === 401 && !skipAuth) {
    refreshInFlight ??= refreshSession().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const problem = await response.json();
      if (typeof problem?.message === "string") message = problem.message;
    } catch {
      // Non-JSON error body (e.g. a bare 404/500 from the host) — fall back to statusText.
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content and similar bodies with nothing to parse.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    apiFetch<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
