import { createFileRoute } from '@tanstack/react-router'
import { storage } from '@/lib/storage'

// 站内乐器模型地址：优先读取已复制进本站文件存储的模型，
// 若本站副本还不存在，则从主人的 GitHub 仓库取回同一文件并留存副本。
const MODEL_FILES: Record<string, string> = {
  'saxophone-alto': 'saxophone_alto.glb',
  'french-horn': 'french_horn.glb',
  trumpet: 'trumpet.glb',
  clarinet: 'clarinet_model_with_annotations.glb',
}

const GITHUB_BASE = 'https://raw.githubusercontent.com/m-12020928-prog/3d-model/main/'

const HEADERS = {
  'content-type': 'model/gltf-binary',
  'cache-control': 'public, max-age=31536000, immutable',
}

export const Route = createFileRoute('/api/models/$name')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const file = MODEL_FILES[params.name]
        if (!file) return new Response('Unknown model', { status: 404 })
        const key = `public/models/${file}`

        try {
          const stored = await storage.get(key)
          if (stored && stored.body) return new Response(stored.body, { headers: HEADERS })
        } catch {
          // 本站存储暂时读不到时继续走 GitHub 原文件。
        }

        try {
          const response = await fetch(`${GITHUB_BASE}${file}`)
          if (!response.ok) return new Response('Model unavailable', { status: 502 })
          const body = await response.arrayBuffer()
          try {
            await storage.put(key, body, { contentType: 'model/gltf-binary' })
          } catch {
            // 留存副本失败不影响本次返回。
          }
          return new Response(body, { headers: HEADERS })
        } catch {
          return new Response('Model unavailable', { status: 502 })
        }
      },
    },
  },
})
