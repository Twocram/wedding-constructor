import type { AppType } from '@saywed/api/app';
import { hc, type ClientResponse } from 'hono/client';

// тот же origin: /api проксирует nginx (в dev — Vite), cookie сессии уходит сама
export const api = hc<AppType>('/').api;

type FieldErrors = Record<string, string[] | undefined>;

const errorCodes: Record<string, string> = {
  not_found: 'Не найдено',
  unauthorized: 'Нужно войти заново',
  too_many_requests: 'Слишком много попыток, попробуйте позже',
  internal_error: 'Ошибка сервера, попробуйте ещё раз',
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly fieldErrors: FieldErrors = {},
    readonly formErrors: string[] = [],
  ) {
    super(formErrors[0] ?? Object.values(fieldErrors).flat()[0] ?? `Ошибка ${status}`);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

type Body<R> = R extends ClientResponse<infer T, number, string> ? T : never;

// успешное тело ответа или исключение с ошибками полей — компонентам не нужно разбирать коды
export const unwrap = async <R extends ClientResponse<unknown, number, string>>(request: Promise<R>) => {
  const res = await request;
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    errors?: FieldErrors | { formErrors?: string[]; fieldErrors?: FieldErrors };
  };
  if (res.ok) return body as Extract<Body<R>, { ok: true }>;
  if (res.status === 401) onUnauthorized();
  const errors = body.errors ?? {};
  if ('fieldErrors' in errors || 'formErrors' in errors) {
    const e = errors as { formErrors?: string[]; fieldErrors?: FieldErrors };
    throw new ApiError(res.status, e.fieldErrors, e.formErrors);
  }
  const message = typeof body.error === 'string' ? errorCodes[body.error] ?? body.error : undefined;
  throw new ApiError(res.status, errors as FieldErrors, message ? [message] : []);
};
