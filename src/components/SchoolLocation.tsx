import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MapPin, Phone } from 'lucide-react'
import { ChapterLabel } from './ArchiveUI'
import { ExhibitBoundary } from './ExhibitBoundary'

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
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect() } }, { rootMargin: '220px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  return <section id="school" ref={root} className="visitor-experience performance-map school-location" aria-labelledby="school-title">
    <div className="experience-heading">
      <div><span className="eyebrow text-gold">Visit / Where we play</span><h3 id="school-title">SMKKB School Band<br /><em>in Kepong Baru.</em></h3></div>
      <p>The band belongs to Sekolah Menengah Kebangsaan Kepong Baru. The map marks the school grounds, where rehearsals and band activities take place.</p>
    </div>
    <div className="map-layout">
      <div className="map-canvas" aria-label="Map of the school in Kepong Baru">
        {near
          ? <ExhibitBoundary><Suspense fallback={<p className="experience-empty" role="status">Preparing the school map…</p>}><StreetMap style="dark" center={{ lat: school.lat, lon: school.lon }} zoom={15} markers={[{ id: 'school', lat: school.lat, lon: school.lon, label: school.name, color: '#C6A875' }]} className="h-[28rem] w-full" /></Suspense></ExhibitBoundary>
          : <p className="experience-empty">The map loads as you approach this section.</p>}
      </div>
      <div className="map-notes">
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