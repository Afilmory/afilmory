/**
 * 可选的轻量构建模式：跳过 build:manifest 的重型照片解码，
 * 直接取一份已经构建好的 photos-manifest.json 供 SSR 构建打包。
 *
 * 适合照片量大的画廊跑在资源受限的 CI 上（Vercel Hobby 等）：
 * 解码几百张 HEIC/JPEG 的内存峰值会超容器上限被直接杀掉，
 * 日志停在「完成任务 N/M」且没有任何错误行（#288）。
 *
 * 重型构建放到 GitHub Actions 或本机跑 `pnpm -w run build:manifest`
 * （githubRepoSyncPlugin 会把 manifest 和缩略图提交回存储仓库），
 * 部署构建只需要把这份现成的 manifest 拿回来。
 *
 * 来源（二选一，环境变量）：
 *   PREBUILT_MANIFEST_URL  manifest 的完整 URL（任意可公开访问的存储）
 *   GALLERY_REPO           GitHub owner/repo，取 main 分支根下的
 *                          photos-manifest.json（jsDelivr 失败时回退 raw）
 *
 * 用法（Vercel Build Command 示例，Root Directory 为 apps/ssr）：
 *   pnpm -w run build:manifest:fetch && pnpm -w run build
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// 兼容任意 cwd：按脚本自身位置定位仓库根
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'packages/data/src/photos-manifest.json')

function host(url) {
  return new URL(url).host
}

function resolveSources() {
  if (process.env.PREBUILT_MANIFEST_URL) {
    return [process.env.PREBUILT_MANIFEST_URL]
  }

  const repo = process.env.GALLERY_REPO
  if (repo) {
    return [
      `https://cdn.jsdelivr.net/gh/${repo}@main/photos-manifest.json`,
      `https://raw.githubusercontent.com/${repo}/main/photos-manifest.json`,
    ]
  }

  throw new Error('需要设置 PREBUILT_MANIFEST_URL 或 GALLERY_REPO（见脚本头部注释）')
}

async function fetchManifest() {
  const errors = []

  for (const url of resolveSources()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) {
        errors.push(`${host(url)} → HTTP ${res.status}`)
        continue
      }

      const json = JSON.parse(await res.text())
      if (!Array.isArray(json?.data) || json.data.length === 0) {
        errors.push(`${host(url)} → manifest 里没有照片`)
        continue
      }

      console.log(`[fetch-manifest] 来源 ${host(url)}，共 ${json.data.length} 张`)
      return json
    }
    catch (e) {
      errors.push(`${host(url)} → ${e.message}`)
    }
  }

  throw new Error(`预构建 manifest 全部来源失败：${errors.join('；')}`)
}

const manifest = await fetchManifest()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(manifest))
console.log(`[fetch-manifest] 已写入 ${OUT}`)
