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
    formsPlugin({ strategy: 'class' }), // 原生表单显式使用 form-*，不重置 AntD 内层输入。
    typographyPlugin, // 文章内容优化（prose）
    aspectRatioPlugin, // 支持 aspect-ratio 工具
  ],
}
