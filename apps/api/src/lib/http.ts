import { Elysia, ValidationError } from 'elysia';
import { env } from '../env';

type FieldErrors = Record<string, string[]>;

// один формат ошибок валидации для сайта и админки: { formErrors, fieldErrors }
const toFieldErrors = (error: Readonly<ValidationError>) => {
  const fieldErrors: FieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.all) {
    // путь приходит строкой: «contact», «amountBreakdown.base» или «/amountBreakdown/base» — берём поле верхнего уровня
    const key = String('path' in issue ? issue.path : '').split(/[./]/).find(Boolean);
    const message = issue.message ?? 'Неверное значение';
    if (key) (fieldErrors[key] ??= []).push(message);
    else formErrors.push(message);
  }
  return { formErrors, fieldErrors };
};

export const fieldError = (field: string, message: string) => ({
  ok: false as const,
  errors: { formErrors: [] as string[], fieldErrors: { [field]: [message] } as FieldErrors },
});

export const errorHandler = new Elysia({ name: 'errors' }).onError({ as: 'global' }, ({ code, error, set, request, path }) => {
  if (code === 'VALIDATION') {
    set.status = 422;
    return { ok: false as const, errors: toFieldErrors(error) };
  }
  if (code === 'NOT_FOUND') {
    set.status = 404;
    return { ok: false as const, error: 'not_found' };
  }
  if (code === 'PARSE') {
    set.status = 400;
    return { ok: false as const, error: 'bad_request' };
  }
  console.error(`[api] ${request.method} ${path}:`, error);
  set.status = 500;
  return { ok: false as const, error: 'internal_error' };
});

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// запросы, меняющие данные, — только со своих страниц; без Origin (curl, сервер-сервер) пропускаем:
// браузер его всегда ставит, а cookie админки SameSite=Strict
export const originGuard = new Elysia({ name: 'origin-guard' }).onRequest(({ request, set }) => {
  if (!MUTATING.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && !env.allowedOrigins.includes(origin)) {
    set.status = 403;
    return { ok: false as const, error: 'forbidden' };
  }
});
