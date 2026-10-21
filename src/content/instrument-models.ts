// 导入的乐器模型配置：站内地址与部件名关键词。
// 模型来自主人的 GitHub 仓库（main 分支），已复制进本站文件存储，经 /api/models/<名字> 读取；
// 读取失败时展台继续用内置模型并如实说明。
export type InstrumentModelConfig = {
  url: string
  /** 部件 id → 用于在模型节点名、网格名中查找的关键词（按顺序匹配，先命中者优先）。 */
  keywords: Record<string, string[]>
  credit?: { text: string; href: string }
}

export const INSTRUMENT_MODELS: Record<string, InstrumentModelConfig> = {
  saxophone: {
    url: '/api/models/saxophone-alto',
    keywords: {
      mouthpiece: ['mouthpiece', 'reed', 'neck', 'bec'],
      keys: ['key', 'pad', 'button', 'rod'],
      bell: ['bell', 'bow', 'flare'],
    },
    // 该模型为 CC BY 4.0，授权要求注明作者。
    credit: {
      text: 'Saxophone model: “saxophone alto” by ANDRIANIAINAToky — CC BY 4.0',
      href: 'https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27',
    },
  },
  'french-horn': {
    url: '/api/models/french-horn',
    keywords: {
      mouthpiece: ['mouthpiece', 'leadpipe', 'lead pipe'],
      valves: ['valve', 'lever', 'rotor', 'casing'],
      bell: ['bell', 'flare', 'rim'],
    },
  },
  trumpet: {
    url: '/api/models/trumpet',
    keywords: {
      valves: ['valve', 'piston', 'casing', 'cap', 'button'],
      slide: ['slide', 'tuning', 'pipe', 'tube', 'brace'],
      bell: ['bell', 'flare'],
    },
  },
  clarinet: {
    url: '/api/models/clarinet',
    keywords: {
      reed: ['reed', 'mouthpiece', 'barrel', 'ligature'],
      register: ['register', 'speaker', 'trill'],
      keys: ['key', 'ring', 'pad', 'rod'],
    },
  },
}
