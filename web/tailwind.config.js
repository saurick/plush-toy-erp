import formsPlugin from '@tailwindcss/forms'
import typographyPlugin from '@tailwindcss/typography'
import aspectRatioPlugin from '@tailwindcss/aspect-ratio'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx}', // 扫描src目录下的所有文件
  ],
  theme: {
    extend: {}, // 扩展主题
  },
  plugins: [
    formsPlugin, // 常用表单样式优化
    typographyPlugin, // 文章内容优化（prose）
    aspectRatioPlugin, // 支持 aspect-ratio 工具
  ],
}
