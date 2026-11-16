import { notifyLocalMutation } from '@/lib/realtime';
import { useAuthStore } from '@/store/authStore';
import { usePlatformAdminStore } from '@/store/platformAdminStore';

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  code?: string;
  retryAfterSeconds?: number;
  rateLimitPolicy?: string;

  constructor(
    status: number,
    message: string,
    data: Record<string, unknown> = {},
    retryAfterSeconds?: number
  ) {
    super(message);
    this.status = status;
    this.data = data;
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.retryAfterSeconds =
      retryAfterSeconds ??
      (typeof data.retry_after_seconds === 'number' ? data.retry_after_seconds : undefined);
    this.rateLimitPolicy = typeof data.policy === 'string' ? data.policy : undefined;
  }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text.trim() };
    }
  }
  if (!res.ok) {
    const headerRetryRaw = res.headers.get('Retry-After');
    const headerRetry = headerRetryRaw ? Number.parseInt(headerRetryRaw, 10) : NaN;
    const bodyRetry =
      typeof parsed.retry_after_seconds === 'number' ? parsed.retry_after_seconds : NaN;
    const retryAfterSeconds = Number.isFinite(bodyRetry)
      ? bodyRetry
      : Number.isFinite(headerRetry)
        ? headerRetry
        : undefined;

    const errMsg =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : res.status === 429 && retryAfterSeconds
          ? `Rate limit exceeded. Try again in ${retryAfterSeconds}s.`
          : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(res.status, errMsg, parsed, retryAfterSeconds);
  }
  return parsed as T;
}

function buildJsonHeaders(
  options: RequestInit & { overrideToken?: string; idempotencyKey?: string },
  token: string | null
): Headers {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.overrideToken) {
    headers.set('X-Supervisor-Override-Token', options.overrideToken);
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }
  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { overrideToken?: string; idempotencyKey?: string } = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = buildJsonHeaders(options, token);

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/logout')) {
    useAuthStore.getState().forceLocalLogout();
    throw new ApiError(401, 'Session expired');
  }
  const data = await parseApiResponse<T>(res);
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    notifyLocalMutation(path);
  }
  return data;
}

export async function adminApiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = usePlatformAdminStore.getState().token;
  const headers = buildJsonHeaders(options, token);

  const res = await fetch(path, { ...options, headers });
  if (
    res.status === 401 &&
    !path.includes('/admin/login') &&
    !path.includes('/admin/logout') &&
    !path.includes('/platform/bootstrap')
  ) {
    usePlatformAdminStore.getState().forceLocalLogout();
    throw new ApiError(401, 'Platform admin session expired');
  }
  const data = await parseApiResponse<T>(res);
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    notifyLocalMutation(path);
  }
  return data;
}

