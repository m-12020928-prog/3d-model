import { useEffect, useRef, useState } from 'react'
import { bandLogo, copy, heroGallery } from '@/content/archive'
import { ChapterLabel } from './ArchiveUI'
import './hero-archive.css'

const photos = heroGallery.filter(item => item.src)
const first = photos[0] ?? heroGallery[0]
const rest = photos.slice(1)

export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(true)
  // 底图层始终显示一张照片；若这张图载入失败，就换下一张可用的，绝不只剩文字说明。
  const [baseIndex, setBaseIndex] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const base = photos[baseIndex] ?? first
  const photo = photos[active % Math.max(1, photos.length)] ?? first
  const advanceBase = () => {
    const next = baseIndex + 1
    if (next < photos.length) setBaseIndex(next)
    else setExhausted(true)
  }
  useEffect(() => {
    const node = ref.current; if (!node) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { if (motion.matches) { node.style.setProperty('--hero-shift', '0px'); return }; const y = Math.min(window.scrollY, window.innerHeight); node.style.setProperty('--hero-shift', `${y * .12}px`) }
    const observer = new IntersectionObserver(([entry]) => { node.classList.toggle('hero-inactive', !entry.isIntersecting); setInView(entry.isIntersecting) }); observer.observe(node)
    window.addEventListener('scroll', update, { passive: true }); update()
    return () => { observer.disconnect(); window.removeEventListener('scroll', update) }
  }, [])
  // 主照片每 3 秒换下一张；交叠淡入淡出交给 CSS，离开视口或切到后台时暂停。
  useEffect(() => {
    if (photos.length < 2 || !inView) return
    let timer = 0
    const start = () => { window.clearInterval(timer); timer = window.setInterval(() => setActive(index => (index + 1) % photos.length), 3000) }
    const stop = () => { window.clearInterval(timer); timer = 0 }
    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); else start() }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [inView])
  return <section id="home" ref={ref} className="hero" aria-labelledby="hero-title"><div className="hero-grid" aria-hidden="true" /><div className="hero-light" aria-hidden="true" />
    <div className="hero-main page-width"><div className="hero-editorial"><ChapterLabel number="01">The living sound archive</ChapterLabel><h1 id="hero-title">More than<br />music.<br /><em>A story</em><br /><em>we share.</em></h1><div className="hero-copy"><span className="short-line" /><p>{copy.hero}</p></div>
      <div className="mt-6 flex items-center gap-3"><img src={bandLogo.src} alt={bandLogo.alt} className="h-12 w-12 rounded-full object-cover ring-1 ring-gold/50" loading="eager" decoding="async" /><span className="eyebrow">SMKKB School Band · Since 1977</span></div></div>
    <div className="hero-art"><div className="hero-photo-wrap"><div className="hero-photo hero-photo-stack">
      {/* 首帧固定可见的底图层，不依赖轮播计时器 */}
      <img className={`hero-photo-layer hero-photo-base${exhausted ? ' is-hidden' : ''}`} src={base.src} alt={exhausted ? '' : base.alt || base.label} loading="eager" fetchPriority="high" decoding="async" onError={advanceBase} />
      {exhausted && <div className="hero-photo-fallback" role="img" aria-label={base.alt || base.label}><span className="eyebrow text-gold">{base.event ?? 'SMKKB SCHOOL BAND'}</span><span className="hero-photo-fallback-title">{base.label}</span></div>}
      {!exhausted && rest.map((item, index) => <img key={item.id} src={item.src} alt={active === index + 1 ? (item.alt || item.label) : ''} className={`hero-photo-layer${active === index + 1 ? ' is-active' : ''}`} loading="lazy" decoding="async" />)}
    </div><div className="hero-photo-caption"><span>{photo.event ?? 'SMKKB SCHOOL BAND'}</span><span>{photo.caption ?? 'A continuing story, since 1977.'}</span></div></div>
      <div className="sr-only" aria-live="polite">{`Now showing: ${photo.label}`}</div>
      <div className="vinyl-wrap" aria-hidden="true"><div className="vinyl"><div className="vinyl-label"><span>SMKKB</span><small>SCHOOL BAND</small><i /><small>ONE BAND · ONE SOUND</small><span className="vinyl-year">1977</span></div></div></div><div className="record-note"><span className="h-px w-7 bg-gold/50" /> A story still in motion.</div><span className="art-coordinate">VOL. 01 / THE SOUND</span></div></div>
  </section>
}