// 网页演示版构建配置。与 vite.config.ts（Electron 渲染进程）并列，互不影响。
//
// root 指到 web/ 子目录，而不是用 rollupOptions.input 指 index.web.html：
// 后者产出的文件名会是 index.web.html，静态托管（GitHub Pages / Nginx）默认只认 index.html，
// 还得在构建后重命名一次。让 root 落在只有一个 index.html 的目录里，产出天然就是 dist-web/index.html。

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // 相对路径：GitHub Pages 的 /<repo>/ 子路径、对象存储的任意前缀、本地 file:// 都能直开。
  // 配合 App.tsx 已经在用的 HashRouter，静态托管不需要任何 rewrite 规则。
  base: './',
  // root 变了，PostCSS 配置要显式指回工程根，否则 tailwind 不生效（整站样式全丢）
  css: { postcss: path.resolve(__dirname) },
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
