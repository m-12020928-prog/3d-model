/** Safe, serializable validation results shared by the browser and server. Never include submitted values. */
export interface InputIssue {
  message: string
  path?: readonly (PropertyKey | { key: PropertyKey })[]
}
export interface InputError {
  code: 'VALIDATION_ERROR'
  message: string
  fieldErrors: Record<string, string>
}
export type InputResult<T> = { ok: true; data: T } | { ok: false; error: InputError }

/** Use explicit messages in the app's language, including expected totals and limits. */
export function invalidInput(message: string, fieldErrors: Record<string, string> = {}): { ok: false; error: InputError } {
  return { ok: false, error: { code: 'VALIDATION_ERROR', message, fieldErrors } }
}

/** Zod-compatible synchronous schemas; run the SAME schema on the server before any write. */
export function validateInput<T>(schema: {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: readonly InputIssue[] } }
}, input: unknown): InputResult<T> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }
  const fields: Record<string, string> = Object.create(null)
  for (const issue of result.error.issues) {
    const key = issue.path?.map(part => String(typeof part === 'object' ? part.key : part)).join('.')
    if (key && !Object.hasOwn(fields, key)) fields[key] = issue.message
  }
  return invalidInput(result.error.issues[0]?.message ?? '', fields)
}

/** Standard Schema / Zod errors, including the JSON issue array serialized by TanStack validators. */
export function inputIssues(error: unknown): readonly InputIssue[] | null {
  let value: unknown = error
  if (error && typeof error === 'object' && 'issues' in error) value = error.issues
  else {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error
      : error && typeof error === 'object' && 'message' in error ? error.message : null
    if (typeof message === 'string' && message.trim().startsWith('[')) {
      try { value = JSON.parse(message) } catch { return null }
    }
  }
  return Array.isArray(value) && value.length > 0 && value.every(issue =>
    issue && typeof issue === 'object' && typeof issue.message === 'string' &&
    (issue.path === undefined || (Array.isArray(issue.path) && issue.path.every((part: unknown) =>
      typeof part === 'string' || typeof part === 'number' ||
      (part && typeof part === 'object' && 'key' in part && ['string', 'number'].includes(typeof part.key))))))
    ? value : null
}
