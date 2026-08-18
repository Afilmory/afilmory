import type { Plugin } from 'vite'

import { siteConfig } from '../../../../site.config'

/** index.html 中的注释占位符,构建时由本插件替换为遥测脚本或移除 */
const TELEMETRY_PLACEHOLDER = '<!-- vibeloft-telemetry -->'

const TELEMETRY_SCRIPT = `<script
      id="vibeloft-telemetry"
      defer
      src="https://vibeloft.ai/telemetry/v1.js"
      data-vl-product-id="e99696d9-d5af-492b-8768-67d12f09af2c"
      data-vl-auth-key="vl_web.cXoOzToLqG2I4TrBn6p0KViwbFjw3DhQ0AWkGp5Xixs"
    ></script>`

/**
 * VibeLoft 遥测 opt-out 插件。
 *
 * 与 manifest-inject 一样用字符串替换处理 index.html:
 * - enabled(默认):把 `<!-- vibeloft-telemetry -->` 占位注释替换为遥测脚本
 * - disabled(config.json 设置 telemetry.vibeloft: false):占位注释替换为空,产物完全不含遥测
 * 静态与 server-serve 构建都会执行(SaaS 默认按仓库 config.json 保留脚本)。
 */
export function vibeloftTelemetryPlugin(): Plugin {
  const enabled = siteConfig.telemetry?.vibeloft !== false

  return {
    name: 'vibeloft-telemetry',

    transformIndexHtml(html) {
      if (enabled) {
        return html.replace(TELEMETRY_PLACEHOLDER, TELEMETRY_SCRIPT)
      }

      return html.replace(TELEMETRY_PLACEHOLDER, '')
    },
  }
}