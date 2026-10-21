// 导入的乐器模型配置：站内地址与真实质感。
// 模型来自主人的 GitHub 仓库（main 分支），已复制进本站文件存储，经 /api/models/<名字> 读取；
// 读取失败时展台继续用内置模型并如实说明。
//
// 模型文件里带的贴图本站不解析，材质因子通常是白色或灰色，所以这里按真实乐器的
// 外观直接给出漆面、镀银键、黑檀木与簧片的颜色，按节点名/网格名匹配到对应部件。
export type ModelFinish = {
  color: [number, number, number]
  metal: number
  rough: number
}

export type FinishRule = {
  /** 命中模型节点名或网格名中任一关键词即用这个质感（按顺序匹配，先命中者优先）。 */
  match: string[]
  finish: ModelFinish
}

export type InstrumentModelConfig = {
  url: string
  /** 管身主色：没有命中任何关键词的网格都用它。 */
  body: ModelFinish
  finishes?: FinishRule[]
}

// 黄铜漆面、较深的号身、镀银/镍银、黑檀木、胶木、皮革衬垫、芦苇簧片、软木、珠母。
const LACQUER: ModelFinish = { color: [0.83, 0.64, 0.29], metal: 1, rough: 0.15 }
const LACQUER_DEEP: ModelFinish = { color: [0.68, 0.5, 0.21], metal: 1, rough: 0.22 }
const NICKEL: ModelFinish = { color: [0.72, 0.73, 0.74], metal: 1, rough: 0.13 }
const BLACK_PLASTIC: ModelFinish = { color: [0.075, 0.072, 0.075], metal: 0.06, rough: 0.26 }
const EBONY: ModelFinish = { color: [0.062, 0.05, 0.045], metal: 0.03, rough: 0.32 }
const PAD_LEATHER: ModelFinish = { color: [0.17, 0.095, 0.07], metal: 0, rough: 0.78 }
const CANE: ModelFinish = { color: [0.79, 0.66, 0.44], metal: 0, rough: 0.7 }
const CORK: ModelFinish = { color: [0.56, 0.42, 0.27], metal: 0, rough: 0.88 }
const PEARL: ModelFinish = { color: [0.88, 0.86, 0.8], metal: 0.2, rough: 0.2 }

export const INSTRUMENT_MODELS: Record<string, InstrumentModelConfig> = {
  saxophone: {
    url: '/api/models/saxophone-alto',
    body: LACQUER,
    finishes: [
      { match: ['pad', 'leather', 'felt', 'resonator'], finish: PAD_LEATHER },
      { match: ['cork'], finish: CORK },
      { match: ['mouthpiece', 'bec', 'beak', 'bite', 'ligature', 'reed'], finish: BLACK_PLASTIC },
      { match: ['key', 'rod', 'screw', 'spring', 'guard', 'plate', 'hook', 'ring', 'post'], finish: LACQUER },
      { match: ['bell', 'bow', 'flare', 'body', 'tube', 'neck'], finish: LACQUER_DEEP },
    ],
  },
  'french-horn': {
    url: '/api/models/french-horn',
    body: LACQUER,
    finishes: [
      { match: ['mouthpiece', 'rim', 'cup'], finish: NICKEL },
      { match: ['valve', 'rotor', 'casing', 'lever', 'paddle', 'thumb', 'finger', 'cap', 'screw', 'spring'], finish: NICKEL },
      { match: ['bell', 'flare', 'bow', 'branch', 'tube', 'slide', 'leadpipe', 'lead pipe', 'water'], finish: LACQUER_DEEP },
    ],
  },
  trumpet: {
    url: '/api/models/trumpet',
    body: LACQUER,
    finishes: [
      { match: ['pearl', 'mother', 'inlay'], finish: PEARL },
      { match: ['mouthpiece'], finish: NICKEL },
      { match: ['valve', 'piston', 'casing', 'cap', 'spring', 'stem', 'guide', 'finger', 'button', 'thumb'], finish: NICKEL },
      { match: ['slide', 'tuning', 'pipe', 'tube', 'brace', 'bell', 'flare', 'leadpipe'], finish: LACQUER_DEEP },
    ],
  },
  clarinet: {
    url: '/api/models/clarinet',
    body: EBONY,
    finishes: [
      { match: ['reed'], finish: CANE },
      { match: ['ligature'], finish: NICKEL },
      { match: ['mouthpiece', 'beak', 'bite'], finish: BLACK_PLASTIC },
      { match: ['key', 'ring', 'post', 'rod', 'screw', 'spring', 'plate', 'tenon', 'cap', 'band'], finish: NICKEL },
      { match: ['barrel', 'bell', 'joint', 'body', 'wood', 'tube', 'stock', 'upper', 'lower'], finish: EBONY },
    ],
  },
}
