import { useEffect, useState } from 'react'
import { ArrowUpRight, Award, Compass, X } from 'lucide-react'
import { passportChapters, voiceQuestions } from '@/content/visitor-experiences'
import { instruments } from '@/content/archive'
import { ChapterLabel, SectionLink } from './ArchiveUI'
import { openPassport, stampChapter } from '@/server/passport'
import { useAction } from '@/lib/actions'
import './visitor-experiences.css'

const COMPLETE = 'ONE BAND ONE SOUND'

function chapterTarget(id: string) {
  if (id === 'people') return 'people'
  if (id === 'events') return 'events'
  return id
}

export function VisitorExperiences() {
  const [visited, setVisited] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const open = useAction(() => openPassport(), {
    onSuccess: result => setVisited(result.visited ?? []),
    onError: error => setNotice(typeof error === 'string' ? error : 'Your passport could not be opened yet.'),
  })
  const stamp = useAction((input: { chapterId: string }) => stampChapter({ data: input }), {
    onSuccess: result => setVisited(previous => previous.includes(result.chapterId) ? previous : [...previous, result.chapterId]),
    onError: error => setNotice(typeof error === 'string' ? error : 'This stamp could not be saved yet.'),
  })
  useEffect(() => { open.run() }, [])
  useEffect(() => {
    const onStamp = (event: Event) => {
      const chapterId = (event as CustomEvent<string>).detail
      if (!chapterId || visited.includes(chapterId)) return
      stamp.run({ chapterId })
    }
    window.addEventListener('smkkb:stamp', onStamp)
    return () => window.removeEventListener('smkkb:stamp', onStamp)
  }, [visited])
  const done = passportChapters.every(chapter => visited.includes(chapter.id))
  return <section id="passport" className="visitor-experience" aria-labelledby="passport-title">
    <div className="experience-heading">
      <div><ChapterLabel number="06">Visitor passport / Collect the archive</ChapterLabel><h3 id="passport-title">Visit each chapter.<br /><em>Collect every stamp.</em></h3></div>
      <p>Open each chapter of the archive to light its golden stamp. Collect all five to complete {COMPLETE}.</p>
    </div>
    <ol className="grid gap-3 sm:grid-cols-5">
      {passportChapters.map(chapter => {
        const lit = visited.includes(chapter.id)
        return <li key={chapter.id}><SectionLink id={chapterTarget(chapter.id)} className={`experience-outline passport-stamp${lit ? ' lit' : ''}`}>
          <span className="flex items-center gap-2"><Award size={16} aria-hidden="true" />{chapter.mark} · {chapter.title}</span>
          <small>{lit ? 'Stamped in gold' : 'Visit this chapter to stamp'}</small>
        </SectionLink></li>
      })}
    </ol>
    {done
      ? <p role="status" className="mt-6 border border-[#B49352] bg-[#B49352]/15 px-5 py-4 text-sm tracking-[0.2em]">{COMPLETE} — you have visited the whole archive.</p>
      : <p className="experience-note">Your stamps are kept in this browser for 180 days. {visited.length} of {passportChapters.length} collected.</p>}
    {notice && <p role="alert" className="experience-note">{notice}</p>}
  </section>
}

const instrumentNames: Record<string, string> = Object.fromEntries(instruments.map(item => [item.id, item.name]))

export function VoiceQuiz() {
  const [answers, setAnswers] = useState<string[]>([])
  const [closed, setClosed] = useState(false)
  const result = answers.length === voiceQuestions.length
    ? answers.reduce<Record<string, number>>((count, id) => ({ ...count, [id]: (count[id] ?? 0) + 1 }), {})
    : null
  const top = result ? Object.entries(result).sort((a, b) => b[1] - a[1])[0]?.[0] : null
  if (closed) return null
  return <section id="voice-quiz" className="visitor-experience" aria-labelledby="quiz-title">
    <div className="experience-heading">
      <div><ChapterLabel number="04">New members / Find your voice</ChapterLabel><h3 id="quiz-title">Three questions.<br /><em>Your section awaits.</em></h3></div>
      <p>Answer three short questions about what draws you in. We suggest a brass or woodwind section, then take you to its instrument.</p>
    </div>
    {voiceQuestions.map((question, index) => <fieldset key={question.title} className="mt-6">
      <legend className="eyebrow">{String(index + 1).padStart(2, '0')} · {question.title}</legend>
      <div className="mt-3 flex flex-wrap gap-3">
        {question.options.map(option => <button key={option.label} type="button" aria-pressed={answers[index] === option.instrument} className="experience-outline" onClick={() => setAnswers(previous => { const next = [...previous]; next[index] = option.instrument; return next })}>
          <span className="flex items-center gap-2"><Compass size={14} aria-hidden="true" />{option.label}</span>
        </button>)}
      </div>
    </fieldset>)}
    {top && <div className="map-detail" role="status">
      <h4>Your section: {instrumentNames[top] ?? top}</h4>
      <p>Begin with the {instrumentNames[top] ?? top} exhibition and turn the model in your hands.</p>
      <div className="flex flex-wrap gap-3">
        <SectionLink id="instruments" className="experience-primary">Visit the {instrumentNames[top] ?? top} <ArrowUpRight size={14} aria-hidden="true" /></SectionLink>
        <button type="button" className="experience-outline" onClick={() => { setAnswers([]) }}>Answer again</button>
        <button type="button" className="experience-outline" onClick={() => setClosed(true)} aria-label="Close the section quiz"><X size={14} /> Close</button>
      </div>
    </div>}
  </section>
}
