const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

// English comment: Helper to call API with optional Bearer token.
export async function apiFetch(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export function apiBase() {
  return API_BASE;
}