import type { Instrument } from '@/content/archive'
import { InstrumentStage } from './InstrumentStage'

// 展台用本站自制的三维模型，并保留部件选择：选中的部件会在模型上点亮，说明显示在左侧。
export function InstrumentViewer({ instrument, firstReveal, onIntroDone, selectedPart, onSelectPart }: { instrument: Instrument; firstReveal: boolean; onIntroDone: () => void; selectedPart?: string | null; onSelectPart?: (id: string) => void }) {
  return <InstrumentStage instrument={instrument} firstReveal={firstReveal} onIntroDone={onIntroDone} selectedPart={selectedPart ?? null} onSelectPart={onSelectPart} />
}

export default InstrumentViewer