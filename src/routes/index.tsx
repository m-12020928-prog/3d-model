import { createFileRoute } from '@tanstack/react-router'
import { Navigation } from '@/components/ArchiveUI'
import { Hero } from '@/components/Hero'
import { Legacy } from '@/components/Legacy'
import { Instruments } from '@/components/Instruments'
import { Memories } from '@/components/Memories'
import { Events } from '@/components/Events'
import { People } from '@/components/People'
import { FinalChapters } from '@/components/FinalChapters'

export const Route = createFileRoute('/')({ component: Archive })
function Archive() {
  return <><Navigation /><main id="main-content"><Hero /><Legacy /><Instruments /><Memories /><Events /><People /><FinalChapters /></main></>
}