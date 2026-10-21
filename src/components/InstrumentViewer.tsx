import type { Instrument } from '@/content/archive'
import { InstrumentStage } from './InstrumentStage'

// 展台按乐器载入真实模型；不再有部件选择，模型只呈现乐器外观。
export function InstrumentViewer({ instrument, firstReveal, onIntroDone }: { instrument: Instrument; firstReveal: boolean; onIntroDone: () => void }) {
  return <InstrumentStage instrument={instrument} firstReveal={firstReveal} onIntroDone={onIntroDone} />
}

export default InstrumentViewer
