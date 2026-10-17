import type { App } from '@saywed/api/app'
import { treaty } from '@elysia/eden'

// тот же origin: /api проксирует nginx (в dev — Vite), cookie сессии уходит сама.
// parseDate выключен: иначе Eden превращает в Date любую похожую строку, включая дату события «2027-06-14»
export const api = treaty<App>(window.location.origin, { parseDate: false }).api

type FieldErrors = Record<string, string[] | undefined>

const errorCodes: Record<string, string> = {
  not_found: 'Не найдено',
  unauthorized: 'Нужно войти заново',
  forbidden: 'Запрос отклонён',
  bad_request: 'Неверный запрос',
  too_many_requests: 'Слишком много попыток, попробуйте позже',
  internal_error: 'Ошибка сервера, попробуйте ещё раз',
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly fieldErrors: FieldErrors = {},
    readonly formErrors: string[] = [],
  ) {
    super(formErrors[0] ?? Object.values(fieldErrors).flat()[0] ?? `Ошибка ${status}`)
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

interface TreatyResult { data: unknown, error: { value: unknown } | null, status: number }

// успешный ответ или исключение с ошибками полей — компонентам не нужно разбирать коды
export async function unwrap<R extends TreatyResult>(request: Promise<R>): Promise<NonNullable<R['data']>> {
  const { data, error, status } = await request
  if (!error)
    return data as NonNullable<R['data']>
  if (status === 401)
    onUnauthorized()
  const body = (error.value ?? {}) as { error?: unknown, errors?: { formErrors?: string[], fieldErrors?: FieldErrors } }
  if (body.errors)
    throw new ApiError(status, body.errors.fieldErrors, body.errors.formErrors)
  const message = typeof body.error === 'string' ? (errorCodes[body.error] ?? body.error) : undefined
  throw new ApiError(status, {}, message ? [message] : [])
}
