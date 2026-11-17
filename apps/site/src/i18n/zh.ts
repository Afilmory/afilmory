import type { Translations } from './types'

export const zh: Translations = {
  meta: {
    title: 'Afilmory — 一张照片，一间展厅',
    description:
      '读取每张照片的 EXIF 与主色，把作品排成可以慢慢逛的线上展览。网页、iPhone 和你自己的服务器，打开的是同一间馆。',
  },
  nav: {
    login: '登录',
    create: '开一间展厅',
    lang: 'EN',
  },
  hero: {
    title: ['一张照片，', '一间展厅。'],
    subtitle:
      '读取每张照片的 EXIF 与主色，把作品排成可以慢慢逛的线上展览。网页、iPhone 和你自己的服务器，打开的是同一间馆。',
    newsLabel: '新',
    news: '漫游画墙',
    shotAlt: 'Afilmory 的大图查看器：照片、Photo Inspector 参数面板与底部缩略图条',
  },
  statement: {
    lead: '照片不该埋在网盘里。',
    rest: 'Afilmory 从原片里读出参数、颜色和拍摄地点，把它们排成一间能分享、能慢慢逛的展厅。托管、自建或在 iPhone 上，都是同一间。',
  },
  principles: [
    { title: '读懂原片', body: '机身、镜头、曝光、色彩空间和直方图，直接从原片读取，不压缩、不改写。' },
    { title: '跟随照片的颜色', body: '打开大图，界面的强调色取自这张照片，并自动调到易读的亮度。' },
    { title: '一间馆，三个入口', body: '网页、iPhone App 和自建服务器，共用同一套展厅与数据。' },
  ],
  wall: {
    title: ['先挂', '上墙'],
    body: '作品按原始比例铺成瀑布流，也能切成列表或画墙。按标签、相机、镜头、评分和日期筛选；点开一张，Photo Inspector 摊开拍摄参数、影调和直方图。',
    shotAlt: 'Afilmory 画廊首页：按原始比例排列的瀑布流照片墙',
    details: [
      { title: 'Live Photo', body: '悬停或按住，回放动态和声音' },
      { title: '地图足迹', body: '带 GPS 的照片按地点聚在一起' },
      { title: '原图渐进加载', body: '先看缩略图，原图在后台加载' },
      { title: '自己的域名', body: 'your-name.afilmory.art，或换成你的' },
    ],
  },
  canvas: {
    title: ['漫游', '画墙'],
    body: '整间馆铺在一张无限画布上，拖着走。按月份、相机、标签或颜色重新排列；按住一张，相似的照片会聚过来；缩小到 20% 以下，画墙卷成一条胶片。',
    shotAlt: '漫游画墙：无限画布上的照片，底部是 Wander、Month、Camera、Tag、Color 排列切换',
  },
  discover: {
    title: '看看别人的展厅',
    photos: '张',
    loading: '正在加载画廊…',
    empty: '暂无推荐画廊。',
    error: '加载画廊失败。',
  },
  ways: {
    title: ['在哪儿冲洗，', '都是同一间馆'],
    body: '拍完在 iPhone 上直接上传，或者把照片留在你自己的存储里。Afilmory 负责生成缩略图、模糊占位和 EXIF 索引。',
    iphone: { title: 'iPhone', body: '上传、整理自己的展厅，也逛别人的。', shotAlt: 'Afilmory iPhone App 的展览页' },
    selfHost: {
      title: '自建',
      body: '开源。一条命令跑起来，照片留在你自己的存储里。',
      copy: '复制',
      copied: '已复制',
      copyLabel: '复制命令',
      guide: '自建指南',
    },
  },
  open: {
    title: ['给你的照片', '开一间展厅。'],
    button: '开一间展厅',
    pending: '正在检查…',
    fine: '免费额度 500 张 / 5 GB · 之后可绑定自己的域名',
  },
  createModal: {
    label: '创建空间',
    title: '创建你的专属空间',
    description: '选一个独一无二的名字，这会成为你的网址。',
    inputLabel: '空间名称',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    tipsTitle: '规则',
    tips: [
      '名称支持 3-32 个字符（小写英文字母、数字、短横线 -）',
      '免费额度包含最高 500 张照片及 5GB 存储空间',
      '创建后可在后台设置中绑定你自己的独立域名',
    ],
    button: '创建空间',
    buttonPending: '正在创建...',
    close: '关闭',
    validations: {
      required: '请输入空间名称',
      minLength: '空间名称至少需要 3 个字符',
      invalid: '只允许小写字母、数字和短横线',
    },
    errors: {
      generic: '创建失败，请重试',
      network: '网络错误，请检查网络连接',
      missingRedirect: '服务器已响应，但未提供跳转地址',
    },
  },
  loginModal: {
    label: '登录',
    title: '进入你的空间',
    description: '输入你的空间名称以进入后台。',
    inputLabel: '空间名称',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    button: '前往空间',
    close: '关闭',
    validations: {
      required: '请输入空间名称',
      minLength: '空间名称至少需要 3 个字符',
      invalid: '只允许小写字母、数字和短横线',
    },
  },
  footer: {
    terms: '服务条款',
    privacy: '隐私政策',
    docs: '文档',
    github: 'GitHub',
    selfHost: '自建指南',
    appStore: 'App Store',
  },
}
