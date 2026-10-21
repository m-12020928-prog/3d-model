import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Plus, Star } from 'lucide-react'
import { bandAudio, copy, socials, faq } from '@/content/archive'
import { ChapterLabel, SectionLink } from './ArchiveUI'
import { useStageEntries } from './useStageEntries'
import './final-chapters.css'
import './feedback.css'

export function FinalChapters() {
  const root = useRef<HTMLDivElement>(null)
  useStageEntries(root)
  return <div ref={root}><section id="sound-room" className="sound-room" aria-labelledby="sound-title"><div className="page-width"><ChapterLabel number="07">Sound Room / The band recording</ChapterLabel><div className="sound-composition"><span className="eyebrow sound-status">Only plays when you press play</span><h2 id="sound-title" className="section-title">Listen to<br /><em>our sound.</em></h2><div className="silent-wave" aria-hidden="true">{Array.from({length: 49}, (_, i) => <i key={i} style={{height: `${12 + ((i * 13 + 7) % 19) * 4}px`}} />)}</div><p className="section-intro">Press play to hear the band recording shared by the team.</p><audio controls preload="none" src={bandAudio.src} className="mt-6 w-full max-w-xl" aria-label={`Audio player: ${bandAudio.label}`}>Your browser cannot play this recording.</audio><span className="eyebrow mt-7 block">Band recording · {bandAudio.label}</span></div></div></section><section id="faq" className="faq-section" aria-labelledby="faq-title"><div className="page-width faq-layout"><div><ChapterLabel number="08">Notes from the archive</ChapterLabel><h2 id="faq-title" className="section-title mt-8">A few things<br /><em>to know.</em></h2></div><div className="faq-list">{faq.map(item => <details key={item.question}><summary>{item.question}<Plus size={18} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></div></section><Feedback /><section className="closing-scene" aria-labelledby="closing-title" data-stage><div className="closing-copy page-width"><span className="eyebrow text-gold">The final note</span><h2 id="closing-title" className="section-title mt-8">The last note<br /><em>is not the end.</em></h2><p className="section-intro mt-8">{copy.final}</p></div><div className="empty-stage"><div className="last-spotlight" aria-hidden="true" /><div className="last-stage-floor" aria-hidden="true" /><p className="last-motto">ONE BAND<br /><span>ONE SOUND</span></p><span className="eyebrow stage-signature">SMKKB School Band · Since 1977</span></div></section><footer className="site-footer"><div className="page-width"><div className="footer-top"><div><p className="font-display text-3xl">SMKKB School Band</p><p className="eyebrow mt-3">The living sound archive</p></div><nav aria-label="Social media" className="social-links">{socials.map(social => <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer">{social.name}<ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>)}</nav></div><div className="footer-bottom"><span>ONE BAND ONE SOUND</span><nav aria-label="Footer navigation"><SectionLink id="faq">FAQ</SectionLink><SectionLink id="feedback">Feedback</SectionLink><BackToTop /></nav></div></div></footer></div>
}

// 回到顶部用真实的滚动，而不是只改地址中的锚点。
function BackToTop() {
  return <button type="button" className="text-link" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>Back to top <ArrowUp size={13} aria-hidden="true" /></button>
}

function Feedback() {
  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [checked, setChecked] = useState(false)
  const [ready, setReady] = useState(false)
  // 水合完成前先锁住表单，避免原生提交把写好的内容冲掉。
  useEffect(() => setReady(true), [])
  // 本版只在浏览器内校验，留言不会发送、不会保存到任何地方。
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setChecked(false)
    if (!rating) { setProblem('Choose a rating from one to five stars.'); return }
    const text = message.trim()
    if (text.length < 5 || text.length > 2000) { setProblem('Please write a note of 5 to 2,000 characters.'); return }
    setProblem('')
    setChecked(true)
    setRating(0)
    setMessage('')
  }
  const shown = problem
  return <section id="feedback" className="feedback-section" aria-labelledby="feedback-title"><div className="page-width feedback-layout"><div><ChapterLabel number="09">Leave an archive note</ChapterLabel><h2 id="feedback-title" className="section-title mt-8">Your thoughts.<br /><em>Part of the conversation.</em></h2><p className="section-intro mt-7">Give the archive a rating and write your note. In this first version your note is checked here in the browser only — it is not sent or saved yet.</p></div>
    <form className="archive-note" noValidate onSubmit={submit}>
      <fieldset disabled={!ready}>
        <span className="eyebrow text-gold">Archive correspondence</span>
        <fieldset className="feedback-rating" style={{ marginTop: 18 }}>
          <legend>Your rating</legend>
          <div className="feedback-stars" role="radiogroup" aria-label="Your rating from one to five stars">
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={rating >= value ? 'star-lit' : ''} title={`${value} of 5`}>
              <input type="radio" name="feedback-rating" value={value} checked={rating === value} onChange={() => { setRating(value); setProblem(''); setChecked(false) }} />
              <Star size={22} aria-hidden="true" />
              <span className="sr-only">{value} of 5</span>
            </label>)}
          </div>
          <span className="feedback-rating-value">{rating ? `${rating} of 5` : 'No rating chosen yet'}</span>
        </fieldset>
        <label htmlFor="feedback-message">Your note</label>
        <textarea id="feedback-message" value={message} required minLength={5} maxLength={2000} rows={5} placeholder="Write your note…" onChange={event => { setMessage(event.target.value); setChecked(false) }} />
        <div className="note-bottom"><span>{message.length} / 2,000</span><button type="submit">Submit your note <ArrowUpRight size={16} aria-hidden="true" /></button></div>
        {shown && <p id="feedback-error" role="alert" className="form-message">{shown}</p>}
        {checked && <div role="status" className="form-message"><strong>Thank you for your feedback!</strong><p>This demonstration version checks your note here in the browser only — nothing is sent or saved.</p></div>}
      </fieldset>
    </form></div></section>
}