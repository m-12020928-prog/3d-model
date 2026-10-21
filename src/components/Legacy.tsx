import { useCallback, useEffect, useRef, useState } from 'react'
import type { Photo } from '@/content/archive'
import { copy, legacyPhotos } from '@/content/archive'
import { ChapterLabel, PhotoPanel, PhotoSurface } from './ArchiveUI'
import './exhibition.css'

const zoneNames = ['Entrance', 'The archive wall']
export function Legacy() {
  const root = useRef<HTMLElement>(null)
  const [zone, setZone] = useState(0)
  // 选中的照片：桌面在右侧栏、手机在底部面板展开档案资料，关闭后回到原来的浏览位置。
  const [selected, setSelected] = useState<Photo | null>(null)
  const close = useCallback(() => setSelected(null), [])
  useEffect(() => {
    const node = root.current
    if (!node) return
    const zones = Array.from(node.querySelectorAll<HTMLElement>('[data-zone]'))
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const update = () => {
      frame = 0
      let active = 0
      zones.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (rect.top < window.innerHeight * .5) active = i
        const p = Math.max(-1, Math.min(1, rect.top / window.innerHeight))
        el.style.setProperty('--museum-shift', motion.matches ? '0px' : `${p * 45}px`)
      })
      const r = node.getBoundingClientRect()
      node.style.setProperty('--archive-progress', String(Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - window.innerHeight)))))
      setZone(active)
    }
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update(); window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', scroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll) }
  }, [])
  const wallPhotos: Photo[] = [legacyPhotos[1], legacyPhotos[2], legacyPhotos[3]].filter(Boolean)
  return <section id="legacy" className="legacy-section" ref={root} aria-labelledby="legacy-title">
    <div className="museum-progress" aria-hidden="true"><span className="museum-progress-track"><i /></span><span>{String(zone + 1).padStart(2, '0')} / {zoneNames[zone]}</span></div>
    <div data-zone className="museum-zone museum-entrance page-width">
      <ChapterLabel number="02">Legacy / The living sound archive</ChapterLabel>
      <div className="legacy-entrance-grid"><div className="founding-year"><span className="eyebrow">The story begins</span><div>19<span>77</span></div><span className="eyebrow">SMKKB School Band · Established 1977</span></div><div className="legacy-intro"><h2 id="legacy-title" className="section-title">Time moves<br />forward.<br /><em>The music<br />carries on.</em></h2><p className="section-intro mt-8">{copy.legacy}</p></div></div>
    </div>
    <div data-zone className="museum-zone archive-wall page-width"><ChapterLabel number="03">The archive wall</ChapterLabel><div className="wall-composition"><PhotoSurface photo={legacyPhotos[1]} className="wall-photo-a" onSelect={() => setSelected(legacyPhotos[1])} /><div className="wall-note"><span className="eyebrow text-gold">A growing collection</span><h3>Not every memory<br />needs the same frame.</h3><p>Photographs from the band’s own collection. Dates appear only where they are known, and each caption describes what the picture itself shows. Open a photograph to read its archive note.</p></div><PhotoSurface photo={legacyPhotos[2]} className="wall-photo-b" onSelect={() => setSelected(legacyPhotos[2])} /><PhotoSurface photo={legacyPhotos[3]} className="wall-photo-c" onSelect={() => setSelected(legacyPhotos[3])} /></div></div>
    <PhotoPanel photo={selected} close={close} />
    <ul className="tunnel-sr" aria-label="Archive photographs">{wallPhotos.map(photo => <li key={photo.id}><button type="button" onClick={() => setSelected(photo)}>{photo.label}</button></li>)}</ul>
  </section>
}