import type { UiNode, UiSchema } from '../ui-schema/ui-schema.type'
import type { SiteSettingKey } from './site-setting.type'

export const SITE_SETTING_UI_SCHEMA_VERSION = '1.0.0'

export const SITE_SETTING_UI_SCHEMA: UiSchema<SiteSettingKey> = {
  version: SITE_SETTING_UI_SCHEMA_VERSION,
  title: '站点设置',
  description: '配置前台站点的基础信息、品牌样式与地图展示能力。',
  sections: [
    {
      type: 'section',
      id: 'site-basic',
      title: '基础信息',
      description: '这些信息将直接展示在站点的导航栏、标题和 SEO 中。',
      icon: 'layout-dashboard',
      children: [
        {
          type: 'field',
          id: 'site-name',
          title: '站点名称',
          description: '显示在站点导航栏和页面标题中。',
          key: 'site.name',
          required: true,
          component: {
            type: 'text',
            placeholder: '请输入站点名称',
          },
          icon: 'type',
        },
        {
          type: 'field',
          id: 'site-title',
          title: '首页标题',
          description: '用于浏览器标签页及 SEO 标题。',
          key: 'site.title',
          required: true,
          component: {
            type: 'text',
            placeholder: '请输入首页标题',
          },
          icon: 'heading-1',
        },
        {
          type: 'field',
          id: 'site-description',
          title: '站点描述',
          description: '展示在站点简介及搜索引擎摘要中。',
          key: 'site.description',
          required: true,
          component: {
            type: 'textarea',
            placeholder: '请输入站点描述…',
            minRows: 3,
            maxRows: 6,
          },
          icon: 'align-left',
        },
        {
          type: 'field',
          id: 'site-url',
          title: '站点 URL',
          description: '站点对外访问的主域名，必须为绝对地址。',
          key: 'site.url',
          required: true,
          component: {
            type: 'text',
            inputType: 'url',
            placeholder: 'https://afilmory.innei.in',
            autoComplete: 'url',
          },
          icon: 'globe',
        },
        {
          type: 'field',
          id: 'site-accent-color',
          title: '品牌主题色',
          description: '用于按钮、强调文本等高亮元素，支持 HEX 格式。',
          helperText: '示例：#007bff',
          key: 'site.accentColor',
          required: true,
          component: {
            type: 'text',
            placeholder: '#007bff',
          },
          icon: 'palette',
        },
      ],
    },
    {
      type: 'section',
      id: 'site-author-social',
      title: '作者与社交',
      description: '展示在站点关于信息与页脚的联系人和社交账号。',
      icon: 'user-round',
      children: [
        {
          type: 'group',
          id: 'site-author-group',
          title: '作者信息',
          icon: 'id-card',
          children: [
            {
              type: 'field',
              id: 'site-author-name',
              title: '作者名称',
              key: 'site.author.name',
              required: true,
              component: {
                type: 'text',
                placeholder: '请输入作者名称',
                autoComplete: 'name',
              },
              icon: 'user-circle',
            },
            {
              type: 'field',
              id: 'site-author-url',
              title: '作者主页链接',
              key: 'site.author.url',
              required: true,
              component: {
                type: 'text',
                inputType: 'url',
                placeholder: 'https://innei.in/',
                autoComplete: 'url',
              },
              icon: 'link',
            },
            {
              type: 'field',
              id: 'site-author-avatar',
              title: '头像地址',
              description: '可选，展示在站点顶部与分享卡片中。',
              helperText: '留空则不显示头像。',
              key: 'site.author.avatar',
              component: {
                type: 'text',
                inputType: 'url',
                placeholder: 'https://cdn.example.com/avatar.png',
              },
              icon: 'image',
            },
          ],
        },
        {
          type: 'group',
          id: 'site-social-group',
          title: '社交渠道',
          description: '填写完整的链接或用户名，展示在站点社交区块。',
          icon: 'share-2',
          children: [
            {
              type: 'field',
              id: 'site-social-twitter',
              title: 'Twitter',
              helperText: '支持完整链接或 @用户名。',
              key: 'site.social.twitter',
              component: {
                type: 'text',
                placeholder: 'https://twitter.com/username',
              },
              icon: 'twitter',
            },
            {
              type: 'field',
              id: 'site-social-github',
              title: 'GitHub',
              helperText: '支持完整链接或用户名。',
              key: 'site.social.github',
              component: {
                type: 'text',
                placeholder: 'https://github.com/username',
              },
              icon: 'github',
            },
            {
              type: 'field',
              id: 'site-social-rss',
              title: '生成 RSS 订阅源',
              description: '启用后将在前台站点暴露 RSS 订阅入口。',
              helperText: '开启后，访客可通过 RSS 订阅最新照片更新。',
              key: 'site.social.rss',
              component: {
                type: 'switch',
              },
              icon: 'rss',
            },
          ],
        },
      ],
    },
    {
      type: 'section',
      id: 'site-feed',
      title: 'Feed 设置',
      description: '配置第三方 Feed 数据源，用于聚合内容或挑战进度。',
      icon: 'radio',
      children: [
        {
          type: 'group',
          id: 'site-feed-folo',
          title: 'Folo Challenge',
          description: '同步 Folo Challenge 数据所需的 Feed ID 与用户 ID。',
          icon: 'goal',
          children: [
            {
              type: 'field',
              id: 'site-feed-folo-feed-id',
              title: 'Feed ID',
              key: 'site.feed.folo.challenge.feedId',
              component: {
                type: 'text',
                placeholder: '请输入 Feed ID',
              },
              icon: 'hash',
            },
            {
              type: 'field',
              id: 'site-feed-folo-user-id',
              title: 'User ID',
              key: 'site.feed.folo.challenge.userId',
              component: {
                type: 'text',
                placeholder: '请输入 User ID',
              },
              icon: 'user',
            },
          ],
        },
      ],
    },
    {
      type: 'section',
      id: 'site-map',
      title: '地图展示',
      description: '配置地图组件的可用提供商、样式与投影。',
      icon: 'map',
      children: [
        {
          type: 'field',
          id: 'site-map-providers',
          title: '地图提供商列表',
          description: '使用 JSON 数组表示优先级列表，例如 ["maplibre" ]。',
          helperText: '留空则禁用地图功能。',
          key: 'site.map.providers',
          component: {
            type: 'textarea',
            placeholder: '["maplibre"]',
            minRows: 3,
            maxRows: 6,
          },
          icon: 'list',
        },
        {
          type: 'field',
          id: 'site-map-style',
          title: '地图样式',
          description: '填写 MapLibre Style URL，或使用 builtin 选择内置样式。',
          helperText: '示例：builtin 或 https://tiles.example.com/style.json',
          key: 'site.mapStyle',
          component: {
            type: 'text',
            placeholder: 'builtin',
          },
          icon: 'paintbrush',
        },
        {
          type: 'field',
          id: 'site-map-projection',
          title: '地图投影',
          description: '选择地图渲染的投影方式。',
          helperText: '默认为 mercator，可根据需求切换为 globe。',
          key: 'site.mapProjection',
          component: {
            type: 'select',
            placeholder: '选择投影方式',
            options: ['mercator', 'globe'],
          },
          icon: 'compass',
        },
      ],
    },
  ],
}

function collectKeys(nodes: ReadonlyArray<UiNode<SiteSettingKey>>): SiteSettingKey[] {
  const keys: SiteSettingKey[] = []

  for (const node of nodes) {
    if (node.type === 'field') {
      keys.push(node.key)
      continue
    }

    keys.push(...collectKeys(node.children))
  }

  return keys
}

export const SITE_SETTING_UI_SCHEMA_KEYS = Array.from(
  new Set(collectKeys(SITE_SETTING_UI_SCHEMA.sections)),
) as SiteSettingKey[]
