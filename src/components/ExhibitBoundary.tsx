import { Component } from 'react'
import type { ReactNode } from 'react'

// 按需载入的展台即使请求失败，也不能留下空白区域。
export class ExhibitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="stage-loading" role="alert"><div><p>The exhibition stage could not be loaded.</p><p className="mt-3 text-xs">Your place in the archive is still available. Reload to try again.</p><button type="button" className="icon-button mt-6 px-5" onClick={() => window.location.reload()}>Reload page</button></div></div>
    return this.props.children
  }
}
