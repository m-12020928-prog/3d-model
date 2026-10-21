import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUpRight, Image, Menu, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Photo } from '@/content/archive'
import { bandLogo } from '@/content/archive'
import './site-nav.css'

export const sections = ['Home', 'Legacy', 'Instruments', 'Memories', 'Events', 'People', 'Sound Room']
const menuItems = [...sections, 'FAQ', 'Feedback']
const idOf = (label: string) => label.toLowerCase().replace(' ', '-')

export function ChapterLabel({ number, children }: { number: string; children: ReactNode }) { return <div className="eyebrow flex items-center gap-4"><span className="text-gold">{number}</span><span className="h-px w-9 bg-gold/45" /><span>{children}</span></div> }
export function SectionLink({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) { return <Link to="/" hash={id} className={className}>{children}</Link> }

export function Navigation() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('home')
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 70)
      let current = 'home'
      for (const label of menuItems) { const id = idOf(label); const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < window.innerHeight * .38) current = id }
      setActive(current)
    }
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return <><SectionLink id="main-content" className="skip-link">Skip to content</SectionLink><header className={`site-nav ${scrolled ? 'is-scrolled' : ''}`}>
    <SectionLink id="home" className="brand"><img src={bandLogo.src} alt={bandLogo.alt} className="h-9 w-9 rounded-full object-cover ring-1 ring-gold/40" loading="eager" decoding="async" /><span>SMKKB <span className="brand-sub">SCHOOL BAND</span></span></SectionLink>
    <div className="nav-right">
      <span className="nav-est">EST. 1977</span>
      <button type="button" className="nav-bars" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="main-menu" aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
    </div>
    {open && <nav id="main-menu" className="nav-panel" aria-label="Main navigation">{menuItems.map((label, index) => { const id = idOf(label); return <div key={label} onClick={() => setOpen(false)}><SectionLink id={id} className={active === id ? 'active' : ''}><span className="nav-index">{String(index + 1).padStart(2, '0')}</span>{label}</SectionLink></div> })}</nav>}
  </header></>
}

/** 照片：给了 onSelect 时整张照片就是可聚焦的按钮，点开档案资料面板。 */
export function PhotoSurface({ photo, className = '', priority = false, onSelect }: { photo: Photo; className?: string; onSelect?: () => void; priority?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [photo.src])
  const body = <>
    <div className="photo-corner photo-corner-tl" /><div className="photo-corner photo-corner-br" />
    {photo.src && !failed
      ? <img src={photo.src} alt={photo.alt || photo.caption || photo.label} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      : <div className="photo-empty"><Image size={26} strokeWidth={.85} aria-hidden="true" /><span className="photo-label">{photo.label}</span></div>}
    {onSelect && <span className="photo-arrow" aria-hidden="true"><ArrowUpRight size={15} strokeWidth={1} /></span>}
  </>
  if (onSelect) return <button type="button" onClick={onSelect} className={`photo-surface ${className}`} aria-label={`Open the archive note for ${photo.label}`}>{body}</button>
  return <div className={`photo-surface ${className}`}>{body}</div>
}

export function PhotoPanel({ photo, close }: { photo: Photo | null; close: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!photo) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); previous?.focus({ preventScroll: true }) }
  }, [photo, close])
  if (!photo) return null
  return <aside className="photo-panel" role="dialog" aria-modal="false" aria-labelledby="photo-title"><div className="flex items-center justify-between gap-3"><span className="eyebrow text-gold">Archive note</span><button type="button" ref={closeRef} className="icon-button" onClick={close} aria-label="Close photo information"><X size={20} /></button></div><h3 id="photo-title" className="mt-8 text-3xl font-display">{photo.label}</h3><dl className="metadata"><dt>Caption</dt><dd>{photo.caption || photo.label}</dd><dt>Event</dt><dd>{photo.event || '—'}</dd><dt>Date</dt><dd>{photo.date || '—'}</dd></dl></aside>
}

export function ScrollCue({ id, text }: { id: string; text: string }) { return <SectionLink id={id} className="scroll-cue"><span>{text}</span><ArrowDown size={16} /></SectionLink> }