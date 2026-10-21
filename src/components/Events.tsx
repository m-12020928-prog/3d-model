import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from 'lucide-react'
import { copy, events } from '@/content/archive'
import type { BandEvent } from '@/content/archive'
import { ChapterLabel, PhotoSurface, SectionLink } from './ArchiveUI'
import { useStageEntries } from './useStageEntries'
import './stage-chapters.css'
import './activity-archive.css'
import { SchoolLocation } from './SchoolLocation'

function EventStage({ event, index }: { event: BandEvent; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const detail = useRef<HTMLDivElement>(null)
  const openDetails = () => {
    setExpanded(true)
    requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }))
  }
  const gallery = event.photos.filter(photo => photo.src)
  const shown = gallery[photoIndex] ?? gallery[0]
  return <article id={`event-${event.id}`} className={`event-stage event-stage-${index}`} data-stage aria-labelledby={`event-title-${event.id}`}>
    <div className="event-beam" aria-hidden="true" />
    <div className="event-sequence"><span className="eyebrow text-gold">Performance chapter / 0{index + 1}</span>{event.date && <span className="eyebrow">{event.date}</span>}</div>
    <div className="event-composition">
      <div className="event-main-photo"><PhotoSurface photo={event.photos[0]} />{event.result && <div className="event-award"><span className="eyebrow">Confirmed result</span><strong>{event.result}</strong></div>}</div>
      <div className="event-title-block"><span className="event-numeral" aria-hidden="true">0{index + 1}</span><h3 id={`event-title-${event.id}`}>{event.name}</h3>{event.venue && <p className="event-venue">{event.venue}</p>}<button type="button" className="text-link" aria-expanded={expanded} aria-controls={`details-${event.id}`} onClick={() => expanded ? setExpanded(false) : openDetails()}>{expanded ? 'Close chapter' : 'Explore this chapter'}{expanded ? <Minus size={17} /> : <ArrowDownRight size={17} />}</button></div>
      {event.photos[1] && <div className="event-support-photo"><PhotoSurface photo={event.photos[1]} /><span className="eyebrow block mt-3">Another view</span></div>}
    </div>
    <div ref={detail} id={`details-${event.id}`} className="event-details" hidden={!expanded}>
      <div className="event-detail-heading"><h4 className="font-display text-3xl">Inside the chapter.</h4><button type="button" className="text-link" onClick={() => setExpanded(false)} aria-label={`Close ${event.name} details`}>Close <Minus size={15} /></button></div>
      <div className="event-detail-layout">
        <dl className="metadata">
          <dt>Event</dt><dd>{event.name}</dd>
          {event.date && <><dt>Date</dt><dd>{event.date}</dd></>}
          {event.venue && <><dt>Venue</dt><dd>{event.venue}</dd></>}
          {event.result && <><dt>Result</dt><dd>{event.result}</dd></>}
          {event.summary && <><dt>About</dt><dd>{event.summary}</dd></>}
        </dl>
        <div className="event-gallery">{shown && <PhotoSurface photo={shown} />}<div className="event-thumbnails" role="group" aria-label={`${event.name} gallery`}>{gallery.map((photo, i) => <button type="button" key={photo.id} aria-label={`Show photograph ${i + 1}`} aria-pressed={i === photoIndex} onClick={() => setPhotoIndex(i)} className={i === photoIndex ? 'selected' : ''}><span>0{i + 1}</span><span>{photo.featured || i === 0 ? 'Main photograph' : 'Supporting photograph'}</span><ArrowUpRight size={12} /></button>)}</div></div>
      </div>
    </div>
  </article>
}

function ActivityCollection({ event }: { event: BandEvent }) {
  return <details className="activity-row">
    <summary><span>{event.name}</span><Plus size={15} aria-hidden="true" /></summary>
    {event.summary && <p className="activity-summary">{event.summary}</p>}
    <div className="activity-gallery">{event.photos.map(photo => <figure key={photo.id} className="activity-frame">
      <PhotoSurface photo={photo} />
      {photo.caption && <figcaption>{photo.caption}</figcaption>}
    </figure>)}</div>
  </details>
}

export function Events() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(events[0].id)
  const collections = events.filter(event => event.category)
  const chapterEvents = events.filter(event => !event.category)
  useStageEntries(root)
  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(entries => { const entry = entries.find(item => item.isIntersecting); if (entry) setActive(entry.target.id.replace('event-', '')) }, { rootMargin: '-20% 0px -55% 0px' })
    root.current.querySelectorAll('.event-stage').forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  return <section id="events" className="events-section" ref={root} aria-labelledby="events-title"><div className="page-width">
    <ChapterLabel number="05">Events / The stage</ChapterLabel>
    <div className="events-intro"><h2 id="events-title" className="section-title">Every stage becomes<br /><em>part of our story.</em></h2><p className="section-intro">{copy.events}</p></div>
    <nav className="event-directory" aria-label="Event directory">{chapterEvents.map((event, i) => <SectionLink key={event.id} id={`event-${event.id}`} className={active === event.id ? 'current' : ''}><span>0{i + 1}</span>{event.name}{active === event.id && <span className="sr-only"> — Current event</span>}</SectionLink>)}</nav>
    {chapterEvents.map((event, index) => <EventStage key={event.id} event={event} index={index} />)}
    <div className="activity-archive">
      <div><span className="eyebrow text-gold">More from the archive</span><h3 className="font-display text-4xl mt-5">More chapters.<br /><em>From the band’s own folders.</em></h3><p className="section-intro mt-5 text-xs">Collections kept by the band. Open one to see its photographs.</p></div>
      <div>{collections.map(event => <ActivityCollection key={event.id} event={event} />)}</div>
    </div>
    <SchoolLocation />
  </div></section>
}