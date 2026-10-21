import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, Pause, Play } from 'lucide-react'
import { copy, heroGallery } from '@/content/archive'
import { ChapterLabel, SectionLink } from './ArchiveUI'
import './hero-archive.css'

const photos = heroGallery.filter(photo => photo.src)

export function Hero() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const available = photos.filter(photo => !failed.includes(photo.id))
  const current = available[active % Math.max(1, available.length)]

  useEffect(() => {
    const node = root.current
    if (!node) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(preference.matches)
    motion()
    preference.addEventListener('change', motion)
    let onScreen = true
    const updateVisibility = () => setVisible(onScreen && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; updateVisibility() })
    observer.observe(node)
    let frame = 0
    const update = () => {
      frame = 0
      const progress = Math.min(1, Math.max(0, -node.getBoundingClientRect().top / Math.max(1, node.offsetHeight)))
      node.style.setProperty('--hero-progress', preference.matches ? '0' : String(progress))
    }
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', scroll, { passive: true })
    document.addEventListener('visibilitychange', updateVisibility)
    update()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      preference.removeEventListener('change', motion)
      window.removeEventListener('scroll', scroll)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    if (!visible || paused || reduced || available.length < 2) return
    const timer = window.setInterval(() => setActive(index => index + 1), 3000)
    return () => window.clearInterval(timer)
  }, [visible, paused, reduced, available.length])

  return <section id="home" ref={root} className={`hero-section${visible && !paused && !reduced ? ' hero-active' : ''}`} aria-labelledby="hero-title">
    <div className="page-width">
      <div className="edition-line"><span>The living sound archive</span><span>Music · People · Memory</span><span>Established 1977</span></div>
      <div className="edition-masthead" aria-label="SMKKB School Band"><span>SMKKB</span><span>SCHOOL BAND</span></div>
      <div className="hero-layout">
        <div className="hero-copy">
          <ChapterLabel number="01">The sound / The opening note</ChapterLabel>
          <h1 id="hero-title" className="hero-title font-display">More than music.<br /><em>A story<br />we share.</em></h1>
          <p className="hero-description">{copy.hero}</p>
          <SectionLink id="legacy" className="hero-cta">Open the archive <ArrowDownRight size={20} aria-hidden="true" /></SectionLink>
        </div>
        <div className="hero-art">
          <div className="vinyl" aria-hidden="true"><div className="vinyl-disc"><div className="vinyl-label"><b>SMKKB</b><small>SCHOOL BAND</small><i /><small>EST. 1977</small></div></div></div>
          <figure className="hero-photo-wrap">
            <div className="hero-photo-stack">
              {available.map((photo, index) => <img key={photo.id} src={photo.src} alt={current?.id === photo.id ? photo.alt || photo.label : ''} aria-hidden={current?.id !== photo.id} className={`hero-photo-layer${index === 0 ? ' hero-photo-base' : ''}${current?.id === photo.id ? ' is-active' : ''}`} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" onError={() => setFailed(ids => ids.includes(photo.id) ? ids : [...ids, photo.id])} />)}
              {!current && <div className="hero-photo-fallback"><span className="hero-photo-fallback-title">The band photograph is unavailable.</span><span className="eyebrow">The archive continues below.</span></div>}
            </div>
            <figcaption><span>{current?.event || 'SMKKB SCHOOL BAND'}</span><span>{String((active % Math.max(1, available.length)) + 1).padStart(2, '0')} / {String(available.length).padStart(2, '0')}</span></figcaption>
            {available.length > 1 && <button type="button" className="hero-slide-control" aria-label={paused ? 'Resume photograph rotation' : 'Pause photograph rotation'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>}
          </figure>
          <p className="hero-edition-caption">Many voices. One expression.</p>
        </div>
      </div>
      <div className="hero-bottom"><span>ONE BAND ONE SOUND</span><span>A continuing story, since 1977.</span><span>Explore at your own pace ↓</span></div>
    </div>
  </section>
}
