const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
let csrfToken = '';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function refreshCsrf() {
  const response = await fetch(`${BASE}/api/auth/csrf`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new ApiError(`Could not initialize secure session (${response.status}).`, response.status);
  const body = await response.json();
  csrfToken = body.token || '';
  return csrfToken;
}

/** Forget the cached CSRF token so the next state-changing request fetches a fresh one. */
export function resetCsrf() {
  csrfToken = '';
}

async function request(path, options = {}) {
  const { timeoutMs, csrfRetried, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (mutating) {
    if (!csrfToken) await refreshCsrf();
    headers.set('X-XSRF-TOKEN', csrfToken);
  }
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: controller?.signal,
    });
  } catch (error) {
    throw new ApiError(error?.name === 'AbortError' ? 'The server took too long to respond.' : 'Backend API is not responding.', 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // A 403 on a state-changing call is usually a stale cached CSRF token: refresh it once and retry
  // (a rejected request was never executed, so repeating it is safe).
  if (response.status === 403 && mutating && !csrfRetried) {
    await refreshCsrf();
    return request(path, { ...options, csrfRetried: true });
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json(); if (body.message) message = body.message; } catch { /* Non-JSON security errors are expected. */ }
    if (response.status === 401 && !['/api/auth/login', '/api/auth/me', '/api/auth/csrf', '/api/auth/logout'].includes(path)) {
      window.dispatchEvent(new Event('zovive:unauthorized'));
    }
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? null : response.json();
}

export const authApi = {
  me: () => request('/api/auth/me'),
  login: (identifier, password, rememberMe) => request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, password, rememberMe }),
  }),
  logout: () => request('/api/auth/logout', { method: 'POST', timeoutMs: 8000 }),
  users: () => request('/api/admin/users'),
  createUser: (account) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(account) }),
};

export const api = {
  stats: () => request('/api/dashboard/stats'),
  detections: ({ species = '', from = '', to = '' } = {}) => {
    const params = new URLSearchParams();
    if (species) params.set('species', species);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request(`/api/detections?${params.toString()}`);
  },
  addDetection: (detection) => request('/api/detections', { method: 'POST', body: JSON.stringify(detection) }),
  updateDetection: (id, detection) => request(`/api/detections/${id}`, { method: 'PUT', body: JSON.stringify(detection) }),
  deleteDetection: (id) => request(`/api/detections/${id}`, { method: 'DELETE' }),
  alerts: () => request('/api/alerts'),
  updateAlertStatus: (id, status) => request(`/api/alerts/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  cameras: () => request('/api/cameras'),
  addCamera: (camera) => request('/api/cameras', { method: 'POST', body: JSON.stringify(camera) }),
  updateCamera: (id, camera) => request(`/api/cameras/${id}`, { method: 'PUT', body: JSON.stringify(camera) }),
  deleteCamera: (id) => request(`/api/cameras/${id}`, { method: 'DELETE' }),
};

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
