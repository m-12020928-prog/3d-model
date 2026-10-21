import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/monstarx/seo'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Titles, descriptions, social cards and structured data for every page come from the SEO/GEO tab
  // (src/seo.config.ts). A page that wants its own title sets head() in its own route file.
  head: (ctx) => {
    const seo = seoHead(ctx)
    return { ...seo, links: [...seo.links, { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;450;500;550;600;650;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap' }, { rel: 'stylesheet', href: appCss }] }
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-midnight text-parchment antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  return <Outlet />
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="mt-2 text-neutral-500">The page you are looking for does not exist.</p>
      </div>
    </main>
  )
}
