# Mobile Onboarding、StoreKit 与 BYO 存储本地验证报告

## 1. 结论

本次实现已通过本地环境与 iOS Simulator 验收。Mobile 端已具备简化 onboarding、自动工作空间解析、原生 StoreKit 2 购买与恢复、服务端 App Store 交易核验、独立 BYO 存储 Web handoff，以及支付渠道无关的 entitlement 归一化能力。

Simulator 中已验证无有效工作空间身份登录后的租户创建、存储配置页、Safari Web handoff、真实本地 RustFS 连接与保存、App 回跳自动收起、完整 Tab 解锁及冷启动跳过 onboarding。`workspace_required` 与 `storage_required` 现为原生不可关闭步骤，不再显示拖拽条或 “Continue exploring”；异常丢失 presentation 时可由 Explore 横幅和 Account Settings 重新进入，并会自动恢复强制步骤。验证期间发现的运行时问题均已修复并复验，本地范围内无阻断项。

本地可验证范围内未发现阻断项。唯一尚未完成的端到端验证是 Apple Sandbox/TestFlight 真实交易、续订、退款和 App Store Server Notifications V2；该部分需要 App Store Connect 产品、Apple 根证书与 Sandbox 账号，无法由纯本地环境替代。

## 2. 验证基线

| 项目 | 值 |
| --- | --- |
| 日期 | 2026-08-05（Asia/Singapore） |
| Git 基线 | `main` / `a2adf22f`，验证对象为当前未提交工作树 |
| Node.js | v24.18.0 |
| pnpm | 11.1.2 |
| Xcode | 26.5（17F42） |
| Docker | 29.4.0 |
| iOS Simulator | iPhone 17 Pro |
| PostgreSQL | `afilmory_db`，PostgreSQL 16，healthy |
| Redis | `afilmory_redis`，Redis 7，healthy |
| S3 兼容存储 | `afilmory_dev_rustfs`，healthy，端口 9300/9301 |

## 3. 已验证实现范围

| 领域 | 验证结果 |
| --- | --- |
| Mobile onboarding | 登录后由服务端自动选择唯一/当前工作空间；不要求用户手工进入 tenant 域名。没有有效工作空间时展示名称与 slug 创建页；创建成功后自动切换为 owner，并继续存储配置。Workspace 与 owner storage 步骤不可跳过；等待管理员、购买处理中和恢复状态仍可离开。未完成 onboarding 时仅保留 Explore，并提供持久恢复入口。 |
| Readiness 状态机 | 覆盖 `workspace_required`、`storage_required`、`purchase_pending`、`owner_action_required`、`storage_recovery` 与 `ready`。 |
| 统一计费领域 | 新增 provider-neutral 的 subject、offer、offer product、subscription、entitlement、provider event 模型；Creem、App Store 与人工授权统一投影到 entitlement。 |
| StoreKit | 原生 Swift StoreKit 2 模块支持产品读取、本地化价格、`appAccountToken` 购买、恢复、交易监听和订阅管理。仅在服务端确认交易后 finish。 |
| App Store 服务端 | 使用 Apple 官方 App Store Server Library 验证 signed JWS，并校验 bundle、产品、环境、账户 token 与交易归属；通知使用幂等事件 inbox。 |
| BYO Web handoff | 独立、无支付内容的 `/storage-handoff` 页面；一次性 code 换取短期 HttpOnly capability；保存前后均由服务端测试连接；敏感配置加密存储。 |
| Apple 审核边界 | iOS 付费入口仅使用 StoreKit；BYO 外链只执行账户已有存储的技术配置，不展示 Creem、站外 checkout、价格或购买引导。 |
| 账户删除 | Creem 可由服务端取消；App Store 订阅不伪装为已取消，并向用户提供 Apple 订阅管理入口；本地 entitlement 可撤销并清理。 |

## 4. 自动化验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 数据库迁移 | `pnpm -C be/packages/db db:migrate` | 通过；首次应用成功，重复执行仍成功，具备幂等性。 |
| Core 策略与静态资源测试 | `pnpm -C be/apps/core exec vitest run src/...account-deletion.policy.spec.ts src/...billing.policy.spec.ts src/...mobile-onboarding.policy.spec.ts src/...static-asset-host.service.spec.ts` | 4 个文件、18 个测试全部通过；包含无有效 membership 时必须进入 `workspace_required` 的回归断言。 |
| Mobile onboarding 与 Shell 行为测试 | `node --test apps/mobile/src/modules/onboarding/onboardingPresentationPolicy.test.mjs apps/mobile/src/modules/shell/tabAccess.test.mjs` | 7 个测试全部通过；覆盖强制/可离开状态、页面映射、ready 不展示以及 Tab 边界。 |
| 修改文件 lint | `pnpm exec eslint <本次修改的 TS/TSX 文件>` | 通过。 |
| Core 构建 | `pnpm -C be/apps/core build` | 通过。 |
| Dashboard 构建 | `pnpm -C be/apps/dashboard build` | 通过；生成独立 `storage-handoff-*.js` chunk。 |
| 本地 handoff 静态资源 | 请求 `/platform/storage-handoff` 及其 `main-*.js` | HTML 200；`/platform/assets/main-DmTvJKeR.js` 200，`text/javascript`。 |
| Mobile 类型检查 | `pnpm -C apps/mobile type-check` | 通过。 |
| Mobile iOS bundle | `pnpm -C apps/mobile bundle` | 通过；Expo iOS bundle 导出成功。 |
| 原生 StoreKit 测试 | `xcodebuild test -workspace apps/mobile/ios/Afilmory.xcworkspace -scheme AfilmoryNativeTests -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet` | 通过。 |
| 补丁完整性 | `git diff --check` | 通过。 |

## 5. 真实本地 API 纵向验证

验证使用本地 Core `127.0.0.1:1841`、真实 PostgreSQL/Redis 与 RustFS，而非 mock。

测试工作空间：`onboarding-validation-20260805`。该夹具保留在本地数据库中，便于复验；未记录或输出 session、handoff token、access key、secret key 等敏感值。

### 5.1 流程结果

| 步骤 | HTTP/结果 |
| --- | --- |
| 邮箱注册与 session 建立 | 200 |
| 自动创建并解析 owner 工作空间 | 200；无需手工 tenant 输入 |
| 初始 onboarding readiness | `storage_required` |
| 创建 BYO handoff | 200 |
| 一次性 code 交换 capability | 200 |
| 获取 provider schema | 200；包含 S3、OSS、COS、GitHub、B2 |
| 连接本地 RustFS | 200，`connected: true` |
| 保存配置 | 200；服务端在写入前重新测试连接 |
| 最终 onboarding readiness | 200，`ready` |
| 重放一次性 code | 400，拒绝 |
| 重放已消费 capability | 403，拒绝 |
| tenantless 静态 handoff 路由 | 200，返回 Afilmory Dashboard 页面 |
| App Store offers（未配置 Apple 凭据） | 200，`configured: false`、0 offers |
| 账户删除影响预览 | 200；1 个 owner 工作空间、0 个订阅、密码验证方式可用 |

最终 readiness 的关键字段如下：

```json
{
  "state": "ready",
  "workspaceSlug": "onboarding-validation-20260805",
  "role": "owner",
  "canConfigureByo": true,
  "canPurchase": true,
  "activeProvider": "validation-rustfs",
  "hasByoStorage": true,
  "hasManagedStorage": false,
  "appStoreConfigured": false
}
```

### 5.2 数据库证据

| 指标 | 结果 |
| --- | --- |
| 计费 offers | 3 |
| billing subjects | 3（迁移既有租户） |
| 当前 normalized subscriptions | 0 |
| 当前 normalized entitlements | 0 |
| 验证工作空间 settings | 3 |
| 验证工作空间 completed handoffs | 1 |
| 验证工作空间 plan/storage plan | `free` / 无 managed storage plan |

验证工作空间在没有付费 entitlement 的情况下仍因有效 BYO provider 进入 `ready`，证明 BYO 存储不会被 managed entitlement 投影误覆盖。

## 6. iOS Simulator Onboarding 验证

### 6.1 与 Web onboarding 的对齐边界

| Web 步骤 | Mobile 当前实现 | 结论 |
| --- | --- | --- |
| 登录/注册 | Apple、Google、GitHub 可执行首次身份注册；邮箱目前仅支持既有账户登录。 | 社交/Apple 新身份可进入完整 Mobile onboarding；邮箱自助注册尚未提供 Mobile UI。 |
| Workspace | 原生页面填写 workspace name 与 URL slug。 | 已对齐并完成 Simulator 验证。 |
| Site settings | 未复制 Web 的 schema 表单；提示用户创建后前往 Studio 完成高级配置。 | 属于当前简化范围。 |
| Review | 未复制 Web 的独立汇总页；Terms 与 Privacy 保留在存储 onboarding。 | 属于当前简化范围。 |
| Storage | App 内仅展示 Apple-managed storage；BYO 通过无支付内容的 Web handoff 配置。 | 已完成 Simulator 与真实本地后端验证。 |

因此，Mobile onboarding 并非从登录直接跳到存储：当 `activeWorkspace` 为空时，必须先完成 workspace 创建。此前首轮 Simulator 夹具已经预建 workspace，导致该步骤没有出现在截图和首版报告中。

### 6.2 验证环境与方法

| 项目 | 值 |
| --- | --- |
| 设备 | iPhone 17 Pro Simulator，iOS 26.5 |
| App | `app.afilmory`，Expo development client |
| Core | `http://127.0.0.1:1841` |
| Web handoff | `http://localhost:1841/platform/storage-handoff` |
| 数据依赖 | 真实本地 PostgreSQL、Redis 与 RustFS |
| 无有效工作空间夹具 | 用户 `7483285557824421888`，初始 `active_workspace: null`、readiness `workspace_required` |
| 强制步骤与恢复入口夹具 | `onboarding-mandatory-20260805-1816@local.afilmory`；初始 membership suspended、readiness `workspace_required`；Simulator 创建 `mandatory-storage-fixture-1825` 后为 `storage_required` |
| Simulator 创建结果 | `Simulator Created Workspace` / `simulator-created-workspace-1516` |
| 未完成夹具 | `onboarding-simulator-20260805-0400`，最终状态 `storage_required` |
| 完整链路夹具 | `simulator-onboarding-0401`，最终状态 `ready` |

本次验证未使用 onboarding 或存储 mock。由于验证期间 macOS GUI 会话处于锁定状态，无法持续使用桌面级鼠标与键盘自动化，因此采用以下组合方式完成真实链路验证：

- 通过 Simulator 实际运行的 React Native App 验证原生 page sheet、Tab shell、深链回跳与冷启动行为。
- 通过 Hermes Inspector 调用 App 内实际认证、workspace 创建与 presentation 模块，复现并复验登录后的原生弹层切换；请求仍进入真实本地 Core，未绕过 Mobile API 层。
- 将实际生成的 handoff URL 打开到 Simulator Safari，验证 Web 页面、路由和静态资源。
- 使用同一账户和工作空间的另一枚一次性 capability 调用真实 `/test` 与 `/save`，验证 RustFS 连接与持久化。之所以使用两枚 capability，是因为 handoff code/capability 具有一次性消费语义。

### 6.3 Simulator 验证矩阵

| 场景 | 结果 | 证据或关键状态 |
| --- | --- | --- |
| 本地环境探测 | 通过 | Mobile 选择本地 Core，probe 返回 200。 |
| 邮箱登录 | 通过 | 原生登录 page sheet 与系统安全输入提示实际出现；真实登录请求成功。 |
| 无有效 workspace readiness | 通过 | session 返回 `active_workspace: null`；Mobile onboarding 返回 `workspace_required`。 |
| Workspace 创建页 | 通过 | Simulator 原生 form sheet 显示 workspace name、URL identifier、Create workspace 与 Sign out。 |
| Workspace 强制策略 | 通过 | 页面无关闭按钮和拖拽条；实际 presentation snapshot 为 `pageId: workspace-setup`、`dismissible: false`；仍保留 Account Settings 与 Sign out。 |
| 登录状态竞态修复 | 通过 | 复现旧 `storage-setup` presentation 与最新 `workspace_required` 不一致；协调器自动移除旧页并按最新 readiness 打开 Workspace，不再把无租户用户带到存储页。 |
| 创建租户 | 通过 | Mobile 实际 `createInitialWorkspace` 请求成功；创建 `simulator-created-workspace-1516`，membership 为 active owner。 |
| Workspace → Storage 转场 | 通过 | Workspace sheet 完成后自动出现 storage sheet；readiness 为 `storage_required`，无需 reload 或手工进入 tenant。 |
| Storage 强制策略 | 通过 | 页面无关闭按钮、拖拽条和 “Continue exploring”；实际 snapshot 为 `pageId: storage-setup`、`dismissible: false`。 |
| 异常关闭恢复 | 通过 | 通过实际 presentation store 模拟系统丢失强制页后，Explore 显示 “Finish setting up your gallery”；Account Settings 显示 “Continue setup”，执行后重开正确的强制页。 |
| BYO 未保存返回 | 通过 | 模拟 Web handoff 完成原 presentation 但 readiness 仍为 `storage_required`；session 从 id 4 自动重建为 id 5，仍为 `dismissible: false`。 |
| 存储页降级状态 | 通过 | Apple 服务端配置缺失时显示可用页面；`configured: false`、0 offers，不发生 `undefined` 崩溃。 |
| 存储页原生布局 | 通过 | 仅保留页面自身标题，无重复导航头；不再出现 form-sheet header 警告。 |
| Web handoff 页面 | 通过 | 实际 setup URL 在 Simulator Safari 中渲染 workspace 与 “Connect your storage”；页面明确说明不包含 subscription/payment controls。 |
| 本地 RustFS 测试 | 通过 | `/test` 返回 200，`connected: true`。 |
| 保存 BYO 配置 | 通过 | `/save` 返回 200，`completed: true`；provider 为 `simulator-rustfs`。 |
| Readiness 切换 | 通过 | `storage_required` → `ready`；`has_byo_storage: true`。 |
| App 深链回跳 | 通过 | `afilmory://onboarding/storage` 返回后刷新 readiness，存储 sheet 自动收起。 |
| 主界面权限 | 通过 | Photos、Map、Explore、Studio 四个 Tab 全部可见。 |
| 冷启动恢复 | 通过 | terminate/launch 后仍为 `ready`，不再展示 onboarding。 |

Simulator 临时截图证据：

| 截图 | 本地路径 |
| --- | --- |
| 登录后自动出现存储 onboarding | `/tmp/afilmory-simulator-post-login-onboarding-fixed.png` |
| 无租户身份的 workspace 创建页 | `/tmp/afilmory-workspace-required-sheet.png` |
| 创建 workspace 后自动进入存储页 | `/tmp/afilmory-workspace-created-storage-transition.png` |
| 强制 Workspace 页（无关闭/拖拽入口） | `/tmp/afilmory-workspace-required-mandatory-fixed.png` |
| 异常关闭后的 Explore 恢复横幅 | `/tmp/afilmory-onboarding-recovery-banner.png` |
| Account Settings 的 Continue setup 入口 | `/tmp/afilmory-account-settings-onboarding-reentry-fixed.png` |
| 强制 Storage 页（无 Continue exploring） | `/tmp/afilmory-storage-required-mandatory-fixed.png` |
| 无重复 header 的存储页 | `/tmp/afilmory-simulator-clean-sheet.png` |
| Safari Web handoff 页面 | `/tmp/afilmory-simulator-storage-handoff-web-working.png` |
| 完成后完整 Tab | `/tmp/afilmory-simulator-ready-auto-dismiss-hmr.png` |
| 冷启动保持 ready | `/tmp/afilmory-simulator-onboarding-ready-relaunch.png` |

### 6.4 Simulator 最终 readiness

```json
{
  "state": "ready",
  "workspace": "simulator-onboarding-0401",
  "storage": {
    "active_provider": "simulator-rustfs",
    "has_byo_storage": true,
    "has_managed_storage": false,
    "managed_plan_id": null,
    "recovery_required": false
  },
  "permissions": {
    "can_configure_byo": true,
    "can_purchase": true
  },
  "app_store": {
    "configured": false,
    "offers": 0
  }
}
```

## 7. Simulator 验证发现与修复

| 问题 | 根因 | 修复与复验结果 |
| --- | --- | --- |
| 存储 onboarding 在环境或 session 切换时崩溃 | readiness 短暂返回部分结构，页面直接读取 `appStore.offers` 与 `permissions.canPurchase`。 | 为可选子结构提供稳定 fallback；相同切换流程不再崩溃。 |
| 登录成功后存储 sheet 未实际显示 | JS presentation session 在前一个原生 page sheet 尚未完成 `onDismiss` 时过早推进，系统密码提示进一步放大竞态。 | session 增加 `visible` 生命周期；非 sheet modal 等待原生 `onDismiss` 后 finalize，并在 AppState 为 active 时才推进 onboarding。最终登录转场无需 reload 即显示存储 sheet。 |
| 存储页出现重复标题与 form-sheet 警告 | form sheet 同时渲染导航 header 与页面内 header。 | onboarding storage/workspace 页面设为 `headerShown: false`；布局与警告均复验通过。 |
| Safari handoff 页面空白 | Dashboard build 的静态资源 base 为 `/`，但 Core 将应用挂载在 `/platform/`。 | Vite base 改为 `/platform/`；构建产物引用正确子路径。 |
| 本地 Core 将资源重写到生产 CDN | 静态资源 host 只依据数据库 base domain，未识别 localhost/IPv4 请求。 | localhost、`*.localhost` 与 IPv4 请求改为同源资源；新增 4 个行为测试，Safari 实际资源返回 200。 |
| 完成存储配置后 sheet 不自动关闭 | readiness 已更新为 `ready`，页面没有结束 presentation session。 | StorageSetupScreen 监听 ready 并以 `completed` 结束；深链回跳后 sheet 自动收起，完整 Tab 显示。 |
| 强制步骤仍可 Dismiss，关闭后缺少入口 | presentation 默认 `dismissible: true`，存储页还提供 “Continue exploring”，协调器只记录本进程已展示。 | `workspace_required` 与 `storage_required` 使用 `preventNativeDismiss`，隐藏拖拽条并移除跳过按钮；Explore 与 Account Settings 增加恢复入口，强制步骤异常结束后自动重建。 |
| 登录切换后展示了错误的 onboarding 页 | 已存在的 onboarding presentation 未与最新 readiness、页面类型和 dismissible 策略核对。 | 协调器持续协调当前 session；页面或策略不匹配时内部关闭旧页并按最新状态重开。真实 `workspace_required` 夹具已复验。 |
| Account Settings 恢复入口触发 form-sheet 布局警告 | 通用 sheet header 与页面 ScrollView 形成额外原生层级。 | 标题移入 Account Settings 内容并关闭额外 header；恢复入口重新展示后 Metro 无该警告。 |

上述修复均直接应用于当前实现，未增加 feature flag 或兼容分支。

## 8. 安全与审核检查

- handoff code 仅保存哈希，默认 10 分钟有效且只能交换一次。
- capability 通过 15 分钟、HttpOnly、路径受限 Cookie 传递，并在保存后消费。
- 每次读取、测试与保存均重新校验用户和工作空间成员关系。
- Web 页面只接受后端声明的 provider schema；不接受任意设置键。
- 保存动作再次执行服务端连接测试，避免绕过前端测试步骤。
- 存储密钥继续通过 `SettingService` 加密持久化；readiness 使用解密后的配置判断有效性。
- handoff 页面设置 `no-referrer`，且源代码未包含 Creem、checkout、payment 或 pricing 内容。
- StoreKit transaction 必须通过服务端确认后才由原生端 finish，降低客户端伪造与未确认丢单风险。

## 9. 外部环境待验事项

以下项目属于发布前置条件，不属于本地失败：

1. 在 App Store Connect 创建并审核自动续期订阅，确保产品 ID 与后台 offer 映射一致。
2. 配置 `APP_STORE_BUNDLE_ID`、`APP_STORE_APPLE_ID`、`APP_STORE_ROOT_CA_CERTIFICATES`，生产环境启用在线检查。
3. 将 App Store Server Notifications V2 URL 指向 `/api/billing/app-store/notifications-v2`。
4. 使用 Sandbox Apple ID 或 TestFlight 验证购买、取消、恢复、续订、宽限期、退款和撤销通知。
5. 在发布构建中复核 Terms、Privacy、Restore Purchases 与 Manage Subscriptions 链接。
6. 对生产 Creem webhook 执行一次签名事件回放，确认旧订阅迁移与新 entitlement 投影一致。

## 10. 非阻断警告

- Core 构建仍报告既有的 Zod 导出分析和 builder 动态导入分块警告；构建成功，未由本功能引入运行时失败。
- Xcode 报告若干 Expo/React Native Pods build phase 未声明 outputs；原生测试成功。
- Mobile Node 行为测试报告 package 未声明 ESM 类型的性能提示；7 个行为测试均通过。
- Mobile bundle 报告 `FORCE_COLOR` 覆盖 `NO_COLOR` 的 Node 提示；bundle 导出成功。
- Simulator 加载 Explore gallery directory 时仍偶发 PostgreSQL “client is already executing a query” 弃用提示；workspace 创建与 onboarding endpoints 均成功，该警告不属于本次 onboarding 状态机，但应在升级 pg 9 前单独处理。
