import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/** Mã bản build: so với /version.json trên server để báo "có bản mới". Đặt BUILD_ID để cố định (ví dụ mã commit). */
const buildId = process.env.BUILD_ID ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Phát hành version.json cạnh bundle (chỉ khi build). */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) })
    },
  }
}

/** Thay %SITE_URL% trong index.html; không đặt SITE_URL thì bỏ các thẻ cần URL tuyệt đối (canonical, og:url, og:image). */
function siteUrl(): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      const url = (process.env.SITE_URL ?? '').replace(/\/+$/, '')
      if (!url) return html.replace(/<!--site-url:start-->[\s\S]*?<!--site-url:end-->/g, '')
      return html.replaceAll('%SITE_URL%', url).replaceAll('<!--site-url:start-->', '').replaceAll('<!--site-url:end-->', '')
    },
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), versionFile(), siteUrl()],
  server: {
    proxy: {
      '/ws': {
        target: `http://127.0.0.1:${process.env.ROOM_PORT ?? 8787}`,
        ws: true,
      },
      // API của phòng (hồ sơ, quiz, số người) và proxy dữ liệu trận đều do server game phục vụ.
      '/api': { target: `http://127.0.0.1:${process.env.ROOM_PORT ?? 8787}` },
      '/ext': { target: `http://127.0.0.1:${process.env.ROOM_PORT ?? 8787}` },
    },
  },
})
