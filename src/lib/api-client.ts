// Frontend API client — thin fetch wrapper with credentials included + JSON parsing.
// All views use this so error handling is consistent.

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status: number, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    credentials: 'include',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`
    throw new ApiError(msg, res.status, data)
  }
  return data as T
}

export const apiGet = <T = any>(path: string) => api<T>(path)
export const apiPost = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
export const apiPatch = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
export const apiPut = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
export const apiDelete = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })

// POST multipart/form-data (e.g. photo uploads). The browser sets the correct
// Content-Type boundary, so we must NOT set one here.
export async function apiUploadForm<T = any>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`
    throw new ApiError(msg, res.status, data)
  }
  return data as T
}
