// 访客体验的可编辑配置。地图城市点为近似位置，不代表已核实的场馆坐标。
export const performanceLocations = [
  { eventId: 'miw-fest', city: 'Cyberjaya, Malaysia', lat: 2.92, lon: 101.65, precision: 'Approximate city location · not a venue pin' },
]
export const passportChapters = [
  { id: 'legacy', title: 'Legacy', mark: 'I' },
  { id: 'instruments', title: 'Instruments', mark: 'II' },
  { id: 'memories', title: 'Memories', mark: 'III' },
  { id: 'events', title: 'Events', mark: 'IV' },
  { id: 'people', title: 'People', mark: 'V' },
] as const
// 真实修复版尚未提供。接入时填写 restoredSrc；不得把滤镜演示称为修复结果。
export const archiveComparison: { photoId: string; restoredSrc?: string; restoredAlt?: string } = { photoId: 'legacy-featured' }
export const voiceQuestions = [
  { title: 'Which musical character draws you in?', options: [
    { label: 'A flowing, expressive line', instrument: 'saxophone' },
    { label: 'A warm, rounded blend', instrument: 'french-horn' },
    { label: 'A bright, focused entrance', instrument: 'trumpet' },
    { label: 'A subtle shift in colour', instrument: 'clarinet' },
  ] },
  { title: 'What catches your eye in an instrument?', options: [
    { label: 'Sweeping curves and connected keys', instrument: 'saxophone' },
    { label: 'Coiled tubing and a sculptural bell', instrument: 'french-horn' },
    { label: 'Three valves and a crisp silhouette', instrument: 'trumpet' },
    { label: 'A slender body and intricate keywork', instrument: 'clarinet' },
  ] },
  { title: 'What would you like to explore first?', options: [
    { label: 'How one reed gives a metal body its voice', instrument: 'saxophone' },
    { label: 'How lips and coiled tubing shape a tone', instrument: 'french-horn' },
    { label: 'How valve combinations change pitch', instrument: 'trumpet' },
    { label: 'How fingers and a register key open new notes', instrument: 'clarinet' },
  ] },
]
