import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { instruments } from '@/content/archive'
import { ChapterLabel } from './ArchiveUI'
import './instruments.css'
import { ExhibitBoundary } from './ExhibitBoundary'

const InstrumentViewer = lazy(() => import('./InstrumentViewer'))
export function Instruments() {
  const [index, setIndex] = useState(0)
  // 部件选择：选中后在模型上点亮该部件，并显示它的说明。
  const [part, setPart] = useState<string | null>(null)
  const [near, setNear] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const root = useRef<HTMLElement>(null)
  const instrument = instruments[index]
  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect() } }, { rootMargin: '250px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const select = (i: number) => { setIndex((i + instruments.length) % instruments.length); setPart(null) }
  const choosePart = (id: string) => { setPart(current => (current === id ? null : id)) }
  const activePart = instrument.parts.find(item => item.id === part) ?? null
  return <section id="instruments" ref={root} className="instruments-section" aria-labelledby="instruments-title"><div className="page-width">
    <ChapterLabel number="03">Instruments / The art of sound</ChapterLabel>
    <div className="instrument-heading"><h2 id="instruments-title" className="section-title">Different voices.<br /><em>One expression.</em></h2><p className="section-intro">Four instruments. Four ways of shaping sound. Choose one and turn the model in your hands.</p></div>
    <div className="instrument-selector" role="group" aria-label="Choose an instrument">{instruments.map((item, i) => <button key={item.id} type="button" aria-pressed={i === index} onClick={() => select(i)} className={i === index ? 'selected' : ''}><span>{String(i + 1).padStart(2, '0')}</span>{item.name}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div>
    <div className={`instrument-layout instrument-${instrument.id}`}>
      <div className="instrument-editorial"><span className="eyebrow text-gold">{instrument.family}</span><h3>{instrument.name}</h3><p className="instrument-text">{instrument.introduction}</p><div className="mt-7"><span className="eyebrow text-gold">Choose a part</span><div className="mt-3 flex flex-wrap gap-2">{instrument.parts.map((item, i) => <button key={item.id} type="button" aria-pressed={part === item.id} onClick={() => choosePart(item.id)} className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[.16em] transition-colors ${part === item.id ? 'border-[#C6A875] bg-[#C6A875] text-[#10151D]' : 'border-[#B9C8D544] text-[#B9C8D5] hover:border-[#C6A875] hover:text-[#C6A875]'}`}>{String(i + 1).padStart(2, '0')} {item.name}</button>)}</div><p aria-live="polite" className="mt-3 max-w-[420px] text-[11px] leading-relaxed text-[#B9C8D5]">{activePart ? activePart.description : 'Choose a part to light it up on the model, or tap a numbered marker on the stage.'}</p></div><div className="instrument-pagination"><span className="eyebrow"><span className="text-gold">0{index + 1}</span> / 04</span><div className="flex gap-2"><button type="button" className="icon-button" onClick={() => select(index - 1)} aria-label="Previous instrument"><ArrowLeft size={16} /></button><button type="button" className="icon-button" onClick={() => select(index + 1)} aria-label="Next instrument"><ArrowRight size={16} /></button></div></div></div>
      <div className="instrument-stage-slot">{near ? <ExhibitBoundary><Suspense fallback={<div className="stage-loading" role="status">Preparing the exhibition stage…</div>}><InstrumentViewer key={instrument.id} instrument={instrument} firstReveal={!revealed} onIntroDone={() => setRevealed(true)} selectedPart={part} onSelectPart={choosePart} /></Suspense></ExhibitBoundary> : <div className="stage-loading">Instrument exhibition · Interactive model</div>}</div>
    </div>
  </div></section>
}