import { useEffect } from 'react'
import type { RefObject } from 'react'

// 只为已呈现的内容增加舞台入场；无脚本与减少动态模式下内容仍完整可读。
export function useStageEntries(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = node.querySelectorAll<HTMLElement>('[data-stage]')
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('stage-entered')
          observer.unobserve(entry.target)
        }
      }
    }, { threshold: .12 })
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [root])
}
