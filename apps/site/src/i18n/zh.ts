import type { Translations } from './types'

export const zh: Translations = {
  meta: {
    title: 'Afilmory — 摄影作品的线上画廊',
    description:
      '上传照片，Afilmory 会读出机身、镜头和曝光参数，按原图比例排好版。可以在网页和 iPhone 上看，也可以部署在自己的服务器上。',
  },
  nav: {
    login: '登录',
    create: '创建画廊',
    lang: 'EN',
  },
  hero: {
    title: ['摄影作品的', '线上画廊。'],
    subtitle:
      '上传照片，Afilmory 会读出机身、镜头和曝光参数，按原图比例排好版。可以在网页和 iPhone 上看，也可以部署在自己的服务器上。',
    newsLabel: '新',
    news: '漫游画墙',
    shotAlt: 'Afilmory 的大图查看器：照片、右侧参数面板和底部缩略图条',
  },
  statement: {
    lead: '网盘适合存照片，不适合给人看。',
    rest: '缩略图被裁成方块，参数看不到，分享出去是一串文件名。在 Afilmory 里，照片保持原来的比例，参数就在旁边，发出去的是一个能翻着看的网址。',
  },
  principles: [
    { title: '参数自动读取', body: '机身、镜头、光圈、快门、ISO 都从原图的 EXIF 里读，不用手填。' },
    { title: '颜色跟着照片换', body: '打开一张照片，按钮和高亮会换成这张照片的主色。' },
    { title: '网页、iPhone、自建', body: '在 iPhone 上传的照片，网页上马上就能看到。自己部署用的也是同一套程序。' },
  ],
  wall: {
    title: ['按原比例', '排版'],
    body: '照片不裁切，竖图就是竖图。可以按标签、相机、镜头、评分和日期筛选，也能切成列表。点开一张，右侧是完整的拍摄参数和直方图。',
    shotAlt: 'Afilmory 画廊首页：按原图比例排列的瀑布流',
    details: [
      { title: 'Live Photo', body: '鼠标悬停或长按就会播放，带声音' },
      { title: '地图', body: '有 GPS 信息的照片会出现在地图上' },
      { title: '原图渐进加载', body: '先显示缩略图，原图加载完再替换' },
      { title: '自定义域名', body: '默认是 your-name.afilmory.art，也能绑自己的域名' },
    ],
  },
  canvas: {
    title: ['漫游', '画墙'],
    body: '所有照片摊在一张可以随便拖动的画布上。可以按月份、相机、标签或颜色重新排列；按住一张，相似的照片会靠过来；缩小到 20% 以下，会变成一条胶片。',
    shotAlt: '漫游画墙：画布上的照片，底部是 Wander、Month、Camera、Tag、Color 排列切换',
  },
  discover: {
    title: '其他人的画廊',
    photos: '张',
    loading: '正在加载…',
    empty: '暂时还没有推荐的画廊。',
    error: '画廊列表加载失败。',
  },
  ways: {
    title: ['用 App 上传，', '或者自己部署'],
    body: '最省事的是用 iPhone App 直接传。想让照片留在自己的存储里，就用 Docker 部署一份。',
    iphone: {
      title: 'iPhone',
      body: '在手机上传照片、整理画廊，也能看别人的。',
      shotAlt: 'Afilmory iPhone App 的画廊首页',
    },
    selfHost: {
      title: '自己部署',
      body: '代码开源。一条命令启动，存储可以接 S3、B2、GitHub 或本地目录。',
      copy: '复制',
      copied: '已复制',
      copyLabel: '复制命令',
      guide: '部署文档',
    },
  },
  open: {
    title: ['创建你的', '画廊'],
    button: '创建画廊',
    pending: '正在检查…',
    fine: '免费 500 张、5 GB，之后可以绑定自己的域名',
  },
  createModal: {
    label: '创建画廊',
    title: '创建画廊',
    description: '起一个名字，它会成为画廊的网址。',
    inputLabel: '画廊名称',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    tipsTitle: '规则',
    tips: [
      '3–32 个字符，只能用小写字母、数字和短横线',
      '免费额度是 500 张照片、5 GB 存储',
      '创建后可以在后台绑定自己的域名',
    ],
    button: '创建',
    buttonPending: '正在创建…',
    close: '取消',
    validations: {
      required: '请填写画廊名称',
      minLength: '名称至少要 3 个字符',
      invalid: '只能用小写字母、数字和短横线',
    },
    errors: {
      generic: '创建失败，请再试一次',
      network: '网络出错了，请检查网络后再试',
      missingRedirect: '服务器没有返回跳转地址',
    },
  },
  loginModal: {
    label: '登录',
    title: '登录画廊',
    description: '输入画廊名称，会跳转到它的后台。',
    inputLabel: '画廊名称',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    button: '前往',
    close: '取消',
    validations: {
      required: '请填写画廊名称',
      minLength: '名称至少要 3 个字符',
      invalid: '只能用小写字母、数字和短横线',
    },
  },
  footer: {
    terms: '服务条款',
    privacy: '隐私政策',
    docs: '文档',
    github: 'GitHub',
    selfHost: '部署文档',
    appStore: 'App Store',
  },
}
