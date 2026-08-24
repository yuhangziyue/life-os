import type { Config } from 'tailwindcss'

export default {
  // web/index.html 是网页演示版的入口（见 vite.web.config.ts），
  // 不列进来的话它 body 上的 class 会被 tailwind 当成未使用而摇掉
  content: ['./index.html', './web/index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dim: {
          career: '#4A90D9',
          finance: '#50B86C',
          growth: '#9B59B6',
          health: '#E74C3C',
          family: '#F39C12',
          social: '#1ABC9C',
          leisure: '#E91E63',
          spiritual: '#8E44AD',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"',
          '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"',
          '"Microsoft YaHei"', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config
