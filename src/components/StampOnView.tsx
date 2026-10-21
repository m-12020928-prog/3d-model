import { useEffect } from 'react'

// 当访客滚过各章节时，派发盖章事件给参观护照。
const targets: Array<{ id: string; chapter: string }> = [
  { id: 'legacy', chapter: 'legacy' },
  { id: 'instruments', chapter: 'instruments' },
  { id: 'memories', chapter: 'memories' },
  { id: 'events', chapter: 'events' },
  { id: 'people', chapter: 'people' },
]

export function StampOnView() {
  useEffect(() => {
    const seen = new Set<string>()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const chapter = (entry.target as HTMLElement).dataset.stampChapter
          if (!chapter || seen.has(chapter)) continue
          seen.add(chapter)
          window.dispatchEvent(new CustomEvent('smkkb:stamp', { detail: chapter }))
        }
      },
      { threshold: 0.35 },
    )
    const nodes: Element[] = []
    for (const target of targets) {
      const el = document.getElementById(target.id)
      if (el) {
        el.setAttribute('data-stamp-chapter', target.chapter)
        observer.observe(el)
        nodes.push(el)
      }
    }
    return () => observer.disconnect()
  }, [])
  return null
}
