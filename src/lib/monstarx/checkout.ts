import { useEffect, useRef, useState } from 'react'

export interface CheckoutOptions {
  /** Exact additional HTTPS hostnames configured by the app, e.g. a Stripe custom checkout domain. */
  allowedHosts?: readonly string[]
}
export interface CheckoutLink {
  href: string
  target: '_blank'
  rel: 'noopener noreferrer'
}
export type CheckoutRecovery = { state: 'open'; url: string } | { state: 'expired'; canStartNewAttempt: boolean } | { state: 'processing' | 'complete' | 'unknown' }
export type CheckoutStatus = 'idle' | 'preparing' | 'checking' | 'ready' | 'redirecting' | 'unknown' | 'processing' | 'complete' | 'expired' | 'error'
export type CheckoutError = 'timeout' | 'failed' | 'invalid_url' | 'recovery_failed' | 'configuration' | 'invalid_request' | 'provider' | null
export type CheckoutActionResult = { url: string; state?: 'open' } | { state: 'rejected'; code: 'configuration' | 'invalid_request' | 'provider' }

/** Never accept a caller-supplied redirect hostname as configuration. These are trusted app settings. */
export function checkoutLink(value: string, options: CheckoutOptions = {}): CheckoutLink {
  if (typeof value !== 'string' || /[\s\x00-\x1f\x7f]/.test(value)) throw new Error('invalid_url')
  const url = new URL(value)
  const hosts = ['checkout.stripe.com', 'billing.stripe.com', ...(options.allowedHosts ?? [])]
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) throw new Error('invalid_url')
  return { href: url.href, target: '_blank', rel: 'noopener noreferrer' }
}

let diagnosticOperation = 0
function diagnostic(action: 'create' | 'reconcile' | 'redirect' | 'fallback', state: 'started' | 'completed' | 'failed' | 'timeout' | 'blocked' | 'opened', id?: number): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('monstarx:checkout', { detail: { action, state, target: 'stripe', ...(id === undefined ? {} : { id }) } }))
}

/** In a frame, return a real link for the next user click; an async window.open can be blocked by Safari. */
export function handoffCheckout(value: string, options: CheckoutOptions = {}): { status: 'ready' | 'redirecting'; link: CheckoutLink } {
  const link = checkoutLink(value, options)
  if (typeof window === 'undefined' || window.self !== window.top) {
    diagnostic('fallback', 'started')
    return { status: 'ready', link }
  }
  diagnostic('redirect', 'started')
  try {
    window.location.assign(link.href)
    return { status: 'redirecting', link }
  } catch {
    diagnostic('redirect', 'blocked')
    return { status: 'ready', link }
  }
}

interface CheckoutState {
  status: CheckoutStatus
  link: CheckoutLink | null
  error: CheckoutError
}
export interface CheckoutActionOptions<Args extends unknown[]> extends CheckoutOptions {
  /** Read the same persisted order's provider state. This must not create a new checkout. */
  reconcile: (...args: Args) => Promise<CheckoutRecovery>
  timeoutMs?: number
  /** Refresh project-owned order/subscription UI. A return URL alone never confirms payment. */
  onReconciled?: (result: CheckoutRecovery) => void | Promise<void>
}

/**
 * Hosted checkout's action boundary. A slow/failed mutation is UNKNOWN, not permission to submit another order.
 * check() reads that same order. Late answers never redirect after a timeout, reconciliation or unmount.
 * Labels are supplied by the app in its own language; always render link when present, even while redirecting.
 */
export function useCheckout<Args extends unknown[]>(action: (...args: Args) => Promise<CheckoutActionResult>, options: CheckoutActionOptions<Args>) {
  const [state, setState] = useState<CheckoutState>({ status: 'idle', link: null, error: null })
  const [ready, setReady] = useState(false)
  const current = useRef(state)
  const latest = useRef({ action, options })
  latest.current = { action, options }
  const saved = useRef<Args | null>(null)
  const sequence = useRef(0)
  const mounted = useRef(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    mounted.current = true
    setReady(true)
    const focus = () => check()
    const visible = () => { if (document.visibilityState === 'visible') check() }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visible)
    return () => {
      mounted.current = false; sequence.current++
      for (const timer of timers.current) clearTimeout(timer)
      timers.current.clear()
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  function update(next: CheckoutState) {
    current.current = next
    if (mounted.current) setState(next)
  }

  async function perform(kind: 'create' | 'reconcile', args: Args) {
    const id = ++sequence.current
    const operationId = ++diagnosticOperation
    const { action: fn, options: opts } = latest.current
    const requested = opts.timeoutMs ?? 30_000
    const timeoutMs = Number.isFinite(requested) ? Math.min(120_000, Math.max(1, requested)) : 30_000
    update({ status: kind === 'create' ? 'preparing' : 'checking', link: null, error: null })
    diagnostic(kind, 'started', operationId)
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      if (!mounted.current || sequence.current !== id) return
      sequence.current++
      update({ status: 'unknown', link: null, error: 'timeout' })
      diagnostic(kind, 'timeout', operationId)
    }, timeoutMs)
    timers.current.add(timer)
    try {
      let result: CheckoutRecovery
      if (kind === 'create') {
        const created = await fn(...args)
        if (!mounted.current || sequence.current !== id) return
        if (created.state === 'rejected') {
          update({ status: 'error', link: null, error: created.code })
          diagnostic(kind, 'failed', operationId)
          return
        }
        result = { state: 'open', url: created.url }
      } else result = await opts.reconcile(...args)
      if (!mounted.current || sequence.current !== id) return
      if (result.state !== 'open') {
        update({ status: result.state === 'expired' && !result.canStartNewAttempt ? 'unknown' : result.state, link: null, error: null })
        // UI refresh is separate from the provider deadline; it may itself fail or never finish.
        const refreshFailed = () => { if (mounted.current && sequence.current === id) update({ ...current.current, error: 'recovery_failed' }) }
        try { void Promise.resolve(opts.onReconciled?.(result)).catch(refreshFailed) } catch { refreshFailed() }
      } else {
        try {
          // A status refresh must not send the person back out to an unpaid/open checkout.
          const destination = kind === 'create' ? handoffCheckout(result.url, opts) : { status: 'ready' as const, link: checkoutLink(result.url, opts) }
          update({ ...destination, error: null })
        } catch {
          update({ status: 'unknown', link: null, error: 'invalid_url' })
          diagnostic(kind, 'failed', operationId)
          return
        }
      }
      diagnostic(kind, 'completed', operationId)
    } catch {
      if (!mounted.current || sequence.current !== id) return
      update({ status: 'unknown', link: null, error: kind === 'create' ? 'failed' : 'recovery_failed' })
      diagnostic(kind, 'failed', operationId)
    } finally {
      clearTimeout(timer)
      timers.current.delete(timer)
    }
  }

  function run(...args: Args): void {
    if (!mounted.current || !['idle', 'expired', 'error'].includes(current.current.status)) return
    saved.current = args
    void perform('create', args)
  }
  function check(): void {
    if (!mounted.current || !saved.current || !['unknown', 'processing', 'ready', 'redirecting'].includes(current.current.status)) return
    void perform('reconcile', saved.current)
  }
  return { ...state, ready, canStart: ready && ['idle', 'expired', 'error'].includes(state.status), pending: state.status === 'preparing' || state.status === 'checking', run, check }
}
