import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MapPin, Phone, X } from 'lucide-react'
import { ChapterLabel, PhotoSurface } from './ArchiveUI'
import { ExhibitBoundary } from './ExhibitBoundary'
import { performanceLocations } from '@/content/visitor-experiences'
import { events, legacyPhotos } from '@/content/archive'

const StreetMap = lazy(() => import('@/lib/monstarx/map').then(module => ({ default: module.Map })))

const school = {
  name: 'SMKKB School Band',
  address: 'Sekolah Menengah Kebangsaan Kepong Baru, Jalan Helang, Kepong Baru, 52100 Kuala Lumpur, Federal Territory of Kuala Lumpur',
  short: 'Jalan Helang, Kepong Baru, 52100 Kuala Lumpur',
  phone: '03-6274 3287',
  lat: 3.2057,
  lon: 101.6408,
}
const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(school.address)}`

export function SchoolLocation() {
  const [near, setNear] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect() } }, { rootMargin: '220px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const miwEvent = events.find(event => event.id === 'miw-fest' || event.name.includes('MIW'))
  const miwPhoto = miwEvent?.photos.find(photo => photo.src) ?? legacyPhotos.find(photo => photo.event?.includes('MIW'))
  const markers = [
    { id: 'school', lat: school.lat, lon: school.lon, label: school.name, color: '#B49352' },
    ...performanceLocations.map(location => ({ id: `event-${location.eventId}`, lat: location.lat, lon: location.lon, label: location.eventId === 'miw-fest' ? 'MIW FEST 2025 · 2025' : location.city, color: '#8F292B' })),
  ]
  return <section id="school" ref={root} className="visitor-experience performance-map school-location" aria-labelledby="school-title">
    <div className="experience-heading">
      <div><span className="eyebrow text-gold">Visit / Where we play</span><h3 id="school-title">SMKKB School Band<br /><em>in Kepong Baru.</em></h3></div>
      <p>The band belongs to Sekolah Menengah Kebangsaan Kepong Baru. The map marks the school grounds, where rehearsals and band activities take place.</p>
    </div>
    <div className="map-layout">
      <div className="map-canvas" aria-label="Map of performance places and the school">
        {near
          ? <ExhibitBoundary><Suspense fallback={<p className="experience-empty" role="status">Preparing the school map…</p>}><StreetMap
              style="dark"
              center={{ lat: 2.98, lon: 101.62 }}
              zoom={9}
              fit={markers}
              markers={markers}
              onMarkerClick={marker => { if (marker.id?.startsWith('event-')) setSelected(marker.id.replace('event-', '')) }}
              className="h-[28rem] w-full" /></Suspense></ExhibitBoundary>
          : <p className="experience-empty">The map loads as you approach this section.</p>}
      </div>
      <div className="map-notes">
        <p className="eyebrow text-gold">Performance map · approximate city locations</p>
        <div className="mt-4 flex flex-col gap-3">
          {performanceLocations.map(location => <button key={location.eventId} type="button" className="experience-outline map-event" aria-pressed={selected === location.eventId} onClick={() => setSelected(selected === location.eventId ? null : location.eventId)}><MapPin size={18} aria-hidden="true" /><span>{location.eventId === 'miw-fest' ? 'MIW FEST 2025 · 2025' : location.city}<small>{location.city} · {location.precision}</small></span></button>)}
        </div>
        {selected === 'miw-fest' && <div className="map-detail" role="dialog" aria-label="MIW FEST 2025 memory">
          <div className="flex items-start justify-between gap-3"><h4>MIW FEST 2025</h4><button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close MIW FEST 2025 memory"><X size={16} /></button></div>
          {miwPhoto?.src ? <PhotoSurface photo={miwPhoto} /> : <p className="experience-empty">Photograph placeholder — the MIW FEST 2025 photograph will appear here.</p>}
          <p className="mt-3">MIW FEST 2025 · 26–29 June 2025 — the band shared its sound together in Cyberjaya.</p>
          <p className="experience-note">Approximate city location · not a verified venue pin.</p>
          <button type="button" className="experience-outline" onClick={() => setSelected(null)}>Close memory</button>
        </div>}
        <dl className="metadata school-details">
          <dt>School</dt><dd>Sekolah Menengah Kebangsaan Kepong Baru</dd>
          <dt>Address</dt><dd>{school.short}</dd>
          <dt>Phone</dt><dd><a className="text-link" href={`tel:${school.phone.replace(/[^0-9+]/g, '')}`}>{school.phone}</a></dd>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a className="experience-outline map-event" href={directions} target="_blank" rel="noopener noreferrer"><MapPin size={18} aria-hidden="true" /><span>Get directions<small>Opens in a new tab</small></span></a>
          <a className="experience-outline map-event" href={`tel:${school.phone.replace(/[^0-9+]/g, '')}`}><Phone size={18} aria-hidden="true" /><span>Call the school<small>{school.phone}</small></span></a>
        </div>
        <p className="experience-note">Sekolah Menengah Kebangsaan Kepong Baru, Jalan Helang, Kepong Baru, 52100 Kuala Lumpur, Federal Territory of Kuala Lumpur.</p>
      </div>
    </div>
  </section>
}
