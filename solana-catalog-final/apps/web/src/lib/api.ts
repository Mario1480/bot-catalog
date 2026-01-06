// English comment: Hard fallback to avoid broken client bundles
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (typeof window !== "undefined" ? "https://api.utrade.vip" : "https://api.utrade.vip");

// English comment: Fetch helper that safely parses JSON only when applicable.
export async function apiFetch(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  let data: any = null;
  if (text && contentType.includes("application/json")) {
    data = JSON.parse(text);
  } else {
    data = text || null;
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data && data.error
        ? data.error
        : typeof data === "string" && data
        ? data
        : `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export function apiBase() {
  return API_BASE;
}