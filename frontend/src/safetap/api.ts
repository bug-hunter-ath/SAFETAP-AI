import Constants from "expo-constants";

const BASE =
  (Constants.expoConfig?.extra?.backendUrl as string | undefined) ||
  process.env.EXPO_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "";

export const API = `${BASE}/api`;

export async function api<T = any>(
  path: string,
  options?: RequestInit,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const detail = isJson ? (data as any)?.detail : data;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data as T;
}
