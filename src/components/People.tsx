import { useCallback, useRef, useState } from 'react'
import { copy, groupPhoto, leaders } from '@/content/archive'
import type { Photo } from '@/content/archive'
import { ChapterLabel, PhotoPanel, PhotoSurface } from './ArchiveUI'
import { useStageEntries } from './useStageEntries'
import './stage-chapters.css'

export function People() {
  const root = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Photo | null>(null)
  const close = useCallback(() => setSelected(null), [])
  useStageEntries(root)
  return <section id="people" ref={root} className="people-section" aria-labelledby="people-title"><div className="page-width">
    <ChapterLabel number="06">People / Behind the sound</ChapterLabel>
    <div className="people-intro"><h2 id="people-title" className="section-title">The people are<br /><em>the heart of the sound.</em></h2><p className="section-intro">{copy.people}</p></div>
    <div className="leadership-cast">{leaders.map((leader, i) => <article key={leader.name} className={`cast-member cast-${i}`} data-stage aria-labelledby={`leader-${i}`}>
      <div className="cast-spotlight" aria-hidden="true" /><span className="cast-index eyebrow">Portrait / 0{i + 1}</span>
      <PhotoSurface photo={leader.photo} onSelect={() => setSelected(leader.photo)} />
      <div className="cast-caption"><h3 id={`leader-${i}`}>{leader.name}</h3><p className="eyebrow text-gold">{leader.role}</p></div>
    </article>)}</div>
    <div className="group-exhibition" data-stage><div><span className="eyebrow text-gold">Together, beyond the individual</span><h3 className="section-title">Many individuals.<br /><em>One band.</em></h3></div><PhotoSurface photo={groupPhoto} onSelect={() => setSelected(groupPhoto)} /></div>
  </div><PhotoPanel photo={selected} close={close} /></section>
}
