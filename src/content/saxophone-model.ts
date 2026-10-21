// 萨克斯 GLB 模型配置。上传 GLB 后，把它的公开地址填进 url；留空时展台继续使用内置模型。
export const SAXOPHONE_MODEL = {
  url: '',
  // 部件标记在模型包围盒内的相对位置 [x, y, z]，范围 0–1（y 为竖直方向，0 在底部）。
  // 换上真实模型后，按实际外形微调这四个点即可。
  anchors: {
    reed: [0.5, 0.96, 0.5],
    register: [0.5, 0.78, 0.5],
    keys: [0.5, 0.5, 0.5],
    bell: [0.5, 0.08, 0.5],
  } as Record<string, [number, number, number]>,
}
