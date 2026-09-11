# @afilmory/site

Afilmory 官网落地页（Astro + React 岛屿）。

## 开发

```bash
# 在 monorepo 根目录
export PUBLIC_API_URL=https://api.afilmory.art/api   # API 基础地址须包含 /api 前缀
pnpm site:dev
```

打开 http://127.0.0.1:4325

## 构建

```bash
# 本地预览构建（可无 PUBLIC_API_URL，会警告）
pnpm site:build

# 生产 / CI（缺 PUBLIC_API_URL 直接失败）
AFILMORY_SITE_STRICT=1 PUBLIC_API_URL=https://api.afilmory.art/api pnpm site:build
```

产物：`apps/site/dist/`

## 结构

- Hero + 主张
- Live Demo（sticky 三章：网格 → 灯箱+EXIF → 创建空间）
- Discover（`GET /gallery-directory`）
- 创建空间弹层（`POST /tenant/check-slug`）

设计文档：`docs/superpowers/specs/2026-07-29-landing-site-redesign-design.md`
