// SERVER-ONLY. Import inside a server function handler or server route, never a component.
// Persist the attempt's idempotency key AND exact parameters before calling Stripe. A timeout
// does not mean a payment failed. Retrieve the saved session first; never generate a new key
// to recover an uncertain request. Stripe may prune keys after 24 hours: old uncertain attempts
// need provider reconciliation, not blind replay. These helpers never retry automatically.

export type StripeErrorCode = 'configuration' | 'invalid_request' | 'timeout' | 'network' | 'provider' | 'invalid_response'
export type StripeRequestOutcome = 'not_sent' | 'read_only' | 'rejected' | 'unknown'

export class StripeRequestError extends Error {
  readonly name = 'StripeRequestError'
  readonly recovery: 'fix_request' | 'retry_read' | 'reconcile_before_retry'

  constructor(
    readonly code: StripeErrorCode,
    readonly outcome: StripeRequestOutcome,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message)
    this.recovery = outcome === 'unknown' ? 'reconcile_before_retry' : outcome === 'read_only' ? 'retry_read' : 'fix_request'
  }
}

export interface StripeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  /** Stripe form fields, including bracket notation such as line_items[0][price]. */
  params?: Readonly<Record<string, string>> | URLSearchParams
  /** Required for every mutation. Reuse the persisted key and identical parameters on recovery. */
  idempotencyKey?: string
  /** Bounds headers AND response body, defaults to 15 seconds, maximum 60 seconds. */
  timeoutMs?: number
}

const MAX_BODY_BYTES = 1024 * 1024

/** Fixed Stripe origin, bounded I/O, no SDK/Node dependency, and no automatic retries. */
export async function stripeRequest<T = unknown>(path: string, options: StripeRequestOptions = {}): Promise<T> {
  if (typeof window !== 'undefined') throw new StripeRequestError('configuration', 'not_sent', 'Stripe must be called from server code.')
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new StripeRequestError('configuration', 'not_sent', 'Connect Stripe before starting checkout.')
  const method = options.method ?? 'GET'
  const mutation = method !== 'GET'
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!['GET', 'POST', 'DELETE'].includes(method) || !/^\/v1\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) {
    throw new StripeRequestError('invalid_request', 'not_sent', 'Use a Stripe /v1 API path and a supported method.')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new StripeRequestError('invalid_request', 'not_sent', 'Stripe timeout must be greater than zero and at most 60000 ms.')
  }
  if (mutation && (!options.idempotencyKey || !/^[\x21-\x7e]{1,255}$/.test(options.idempotencyKey))) {
    throw new StripeRequestError('invalid_request', 'not_sent', 'Persist and supply a valid idempotency key before a Stripe mutation.')
  }
  const params = new URLSearchParams(options.params)
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` }
  if (mutation) {
    headers['idempotency-key'] = options.idempotencyKey!
    headers['content-type'] = 'application/x-www-form-urlencoded'
  }
  const outcome = mutation ? 'unknown' : 'read_only'
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // Promise.race also bounds fetch implementations/body streams that fail to honor abort.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StripeRequestError('timeout', outcome, mutation
        ? 'Stripe timed out. The request may have succeeded; check the existing session before retrying with the same saved key.'
        : 'Stripe status check timed out. Try checking the existing session again.'))
      controller.abort()
      void reader?.cancel().catch(() => {})
    }, timeoutMs)
  })
  const run = async (): Promise<T> => {
    try {
      const query = !mutation && params.size ? `?${params}` : ''
      const response = await fetch(`https://api.stripe.com${path}${query}`, {
        method, headers, signal: controller.signal, redirect: 'error',
        ...(mutation ? { body: params.toString() } : {}),
      })
      reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > MAX_BODY_BYTES) {
            void reader.cancel().catch(() => {})
            throw new StripeRequestError('invalid_response', outcome, 'Stripe returned an oversized response. Check the existing session before continuing.')
          }
          chunks.push(part.value)
        }
      }
      const requestId = response.headers.get('request-id')
      const safeRequestId = requestId && /^req_[a-zA-Z0-9]{1,100}$/.test(requestId) ? requestId : undefined
      if (!response.ok) {
        // Provider messages can contain submitted customer data. Keep only status and a safe request ID.
        const uncertain = response.status >= 500 || response.status === 409
        throw new StripeRequestError('provider', mutation ? uncertain ? 'unknown' : 'rejected' : 'read_only',
          `Stripe refused the request (HTTP ${response.status}).${mutation && uncertain ? ' Check the existing session before retrying.' : ''}`,
          response.status, safeRequestId)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      try { return JSON.parse(new TextDecoder().decode(bytes)) as T } catch {
        throw new StripeRequestError('invalid_response', outcome, 'Stripe returned an unreadable response. Check the existing session before continuing.', response.status, safeRequestId)
      }
    } catch (error) {
      if (error instanceof StripeRequestError) throw error
      // Never include fetch's error/cause: it can contain authorization, URLs or submitted fields.
      throw new StripeRequestError('network', outcome, mutation
        ? 'Stripe could not be reached. The request may have succeeded; check the existing session before retrying with the same saved key.'
        : 'Stripe status could not be checked. Try checking the existing session again.')
    } finally { reader?.releaseLock() }
  }
  try { return await Promise.race([run(), deadline]) } finally { clearTimeout(timer) }
}

export interface CheckoutSessionOptions {
  timeoutMs?: number
  /** Trusted server configuration only, for Stripe Checkout custom domains. Exact hostnames. */
  allowedCheckoutHosts?: readonly string[]
  /** Match these against the authorized, persisted order before considering fulfillment. */
  expected?: { clientReferenceId?: string; amountTotal?: number; currency?: string }
}

interface CheckoutSessionDetails {
  id: string
  providerStatus: 'open' | 'complete' | 'expired'
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required' | 'unknown'
  mode: 'payment' | 'subscription' | 'setup'
  expiresAt: number
  amountTotal: number | null
  currency: string | null
  clientReferenceId: string | null
}

export type CheckoutSessionState = CheckoutSessionDetails & (
  | { state: 'open'; url: string; paymentConfirmed: false; canStartNewAttempt: false }
  | { state: 'processing'; paymentConfirmed: false; canStartNewAttempt: false }
  | { state: 'complete'; paymentConfirmed: true; canStartNewAttempt: false }
  | { state: 'expired'; paymentConfirmed: false; canStartNewAttempt: boolean }
)

function sessionState(raw: unknown, options: CheckoutSessionOptions, outcome: StripeRequestOutcome, expectedId?: string): CheckoutSessionState {
  const invalid = (): never => { throw new StripeRequestError('invalid_response', outcome, 'Stripe returned an invalid or mismatched checkout session. Check the saved order before continuing.') }
  if (!raw || typeof raw !== 'object') return invalid()
  const data = raw as Record<string, unknown>
  if (data.object !== 'checkout.session' || typeof data.id !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(data.id)
    || (expectedId !== undefined && data.id !== expectedId)
    || !['open', 'complete', 'expired'].includes(String(data.status))
    || !['payment', 'subscription', 'setup'].includes(String(data.mode))
    || typeof data.expires_at !== 'number' || !Number.isFinite(data.expires_at)
    || !(data.amount_total === null || (typeof data.amount_total === 'number' && Number.isSafeInteger(data.amount_total) && data.amount_total >= 0))
    || !(data.currency === null || (typeof data.currency === 'string' && /^[a-z]{3}$/.test(data.currency)))
    || !(data.client_reference_id === null || typeof data.client_reference_id === 'string')) return invalid()
  const expected = options.expected
  if ((expected?.clientReferenceId !== undefined && data.client_reference_id !== expected.clientReferenceId)
    || (expected?.amountTotal !== undefined && data.amount_total !== expected.amountTotal)
    || (expected?.currency !== undefined && data.currency !== expected.currency)) return invalid()
  const details: CheckoutSessionDetails = {
    id: data.id, providerStatus: data.status as CheckoutSessionDetails['providerStatus'],
    paymentStatus: ['paid', 'unpaid', 'no_payment_required'].includes(String(data.payment_status)) ? data.payment_status as CheckoutSessionDetails['paymentStatus'] : 'unknown',
    mode: data.mode as CheckoutSessionDetails['mode'],
    expiresAt: data.expires_at, amountTotal: data.amount_total as number | null,
    currency: data.currency as string | null, clientReferenceId: data.client_reference_id as string | null,
  }
  if (details.providerStatus === 'expired' || (details.providerStatus === 'open' && details.expiresAt * 1000 <= Date.now())) {
    // A local clock crossing expires_at hides Resume, but only Stripe-confirmed expiry permits replacement.
    return { ...details, state: 'expired', paymentConfirmed: false, canStartNewAttempt: details.providerStatus === 'expired' }
  }
  if (details.providerStatus === 'complete') {
    return ['paid', 'no_payment_required'].includes(details.paymentStatus) && details.mode !== 'setup'
      ? { ...details, state: 'complete', paymentConfirmed: true, canStartNewAttempt: false }
      : { ...details, state: 'processing', paymentConfirmed: false, canStartNewAttempt: false }
  }
  if (typeof data.url !== 'string' || /[\s\x00-\x1f\x7f]/.test(data.url)) return invalid()
  let url: URL
  try { url = new URL(data.url) } catch { return invalid() }
  const hosts = ['checkout.stripe.com', ...(options.allowedCheckoutHosts ?? [])]
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return invalid()
  return { ...details, state: 'open', url: url.href, paymentConfirmed: false, canStartNewAttempt: false }
}

/**
 * Reconcile on page load, before Resume, after return, and when a pending page regains focus.
 * Authorize ownership before calling. Only the open result has a URL. A complete/unpaid
 * session is processing. paymentConfirmed describes Stripe's state, not fulfillment: verify
 * the saved order/amount/currency and fulfill once in a transaction. Confirm subscription
 * entitlements separately and use signed webhooks for asynchronous payment changes.
 */
export async function retrieveCheckoutSession(sessionId: string, options: CheckoutSessionOptions = {}): Promise<CheckoutSessionState> {
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) throw new StripeRequestError('invalid_request', 'not_sent', 'A valid saved Checkout session ID is required.')
  const raw = await stripeRequest(`/v1/checkout/sessions/${sessionId}`, { timeoutMs: options.timeoutMs })
  return sessionState(raw, options, 'read_only', sessionId)
}

/** Read-only reconciliation of the persisted session; never creates a replacement. */
export const reconcileCheckoutSession = retrieveCheckoutSession

/** Create one hosted attempt; persist its returned ID before returning the URL to the browser. */
export async function createCheckoutSession(
  params: StripeRequestOptions['params'],
  options: CheckoutSessionOptions & { idempotencyKey: string },
): Promise<CheckoutSessionState> {
  const fields = new URLSearchParams(params)
  const uiMode = fields.get('ui_mode')
  if ((uiMode && !['hosted', 'hosted_page'].includes(uiMode)) || fields.get('mode') === 'setup') {
    throw new StripeRequestError('invalid_request', 'not_sent', 'Use hosted payment or subscription Checkout with this helper.')
  }
  const raw = await stripeRequest('/v1/checkout/sessions', { method: 'POST', params: fields, idempotencyKey: options.idempotencyKey, timeoutMs: options.timeoutMs })
  return sessionState(raw, options, 'unknown')
}
