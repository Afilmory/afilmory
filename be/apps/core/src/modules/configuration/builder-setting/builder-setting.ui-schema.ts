import type { UiSchema } from '../../ui/ui-schema/ui-schema.type'
import type { BuilderSettingField } from './builder-setting.types'

export const BUILDER_SETTING_UI_SCHEMA_VERSION = '1.0.0'

export const BUILDER_SETTING_UI_SCHEMA: UiSchema<BuilderSettingField> = {
  version: BUILDER_SETTING_UI_SCHEMA_VERSION,
  title: '构建器设置',
  description: '配置照片构建任务的并发、日志与仓库同步策略。',
  sections: [
    {
      type: 'section',
      id: 'builder-processing',
      title: '处理与性能',
      description: '控制照片处理的并发数量、Live Photo 行为以及文件 ID 规则。',
      icon: 'cpu',
      children: [
        {
          type: 'group',
          id: 'builder-processing-concurrency',
          title: '并发控制',
          icon: 'gauge-circle',
          children: [
            {
              type: 'field',
              id: 'default-concurrency',
              title: '默认并发数',
              description: '控制单次构建任务的最大并发处理数。',
              helperText: '建议设置为 CPU 核心数的 1-2 倍。',
              key: 'system.processing.defaultConcurrency',
              component: {
                type: 'text',
                inputType: 'number',
                placeholder: '10',
              },
            },
            {
              type: 'field',
              id: 'worker-concurrency',
              title: 'Worker 内部并发',
              description: '使用集群模式时，每个 Worker 进程内部允许的并发任务数。',
              key: 'system.observability.performance.worker.workerConcurrency',
              component: {
                type: 'text',
                inputType: 'number',
                placeholder: '2',
              },
            },
            {
              type: 'field',
              id: 'worker-count',
              title: '最大 Worker 数',
              description: '集群模式下最多可启动的 Worker 进程数量。',
              key: 'system.observability.performance.worker.workerCount',
              component: {
                type: 'text',
                inputType: 'number',
                placeholder: '16',
              },
            },
            {
              type: 'field',
              id: 'worker-timeout',
              title: 'Worker 超时时间 (ms)',
              description: '单个 Worker 在无响应情况下的退出时间，单位为毫秒。',
              key: 'system.observability.performance.worker.timeout',
              component: {
                type: 'text',
                inputType: 'number',
                placeholder: '30000',
              },
            },
          ],
        },
        {
          type: 'group',
          id: 'builder-processing-options',
          title: '处理行为',
          icon: 'settings-2',
          children: [
            {
              type: 'field',
              id: 'enable-live-photo',
              title: '启用 Live Photo 检测',
              description: '检测 HEIC 与 MP4 的配对关系，并为 Live Photo 生成合集。',
              key: 'system.processing.enableLivePhotoDetection',
              component: {
                type: 'switch',
                trueLabel: '已启用',
                falseLabel: '已关闭',
              },
            },
            {
              type: 'field',
              id: 'digest-suffix-length',
              title: '摘要后缀长度',
              description: '在照片 ID 末尾追加的 SHA-256 长度，用于避免命名冲突。0 表示禁用。',
              key: 'system.processing.digestSuffixLength',
              component: {
                type: 'text',
                inputType: 'number',
                placeholder: '0',
              },
            },
            {
              type: 'field',
              id: 'supported-formats',
              title: '允许的图片格式',
              description: '可选，使用逗号分隔的扩展示例：jpg,png,heic。留空表示不限制。',
              key: 'system.processing.supportedFormats',
              component: {
                type: 'text',
                placeholder: 'jpg,png,heic',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'section',
      id: 'builder-observability',
      title: '日志与可观测性',
      description: '控制构建任务的日志级别、进度输出与集群策略。',
      icon: 'activity',
      children: [
        {
          type: 'group',
          id: 'builder-progress',
          title: '进度反馈',
          icon: 'progress',
          children: [
            {
              type: 'field',
              id: 'show-progress',
              title: '显示终端进度条',
              description: '在 CLI 中实时输出处理进度。',
              key: 'system.observability.showProgress',
              component: {
                type: 'switch',
              },
            },
            {
              type: 'field',
              id: 'show-detailed-stats',
              title: '输出详细统计',
              description: '构建完成后打印耗时、增量统计等信息。',
              key: 'system.observability.showDetailedStats',
              component: {
                type: 'switch',
              },
            },
            {
              type: 'field',
              id: 'use-cluster-mode',
              title: '启用集群模式',
              description: '在多核环境下使用 Node.js Cluster 分裂多个 Worker 进程。',
              key: 'system.observability.performance.worker.useClusterMode',
              component: {
                type: 'switch',
              },
            },
          ],
        },
        {
          type: 'group',
          id: 'builder-logging',
          title: '日志级别',
          icon: 'audio-lines',
          children: [
            {
              type: 'field',
              id: 'logging-level',
              title: '日志等级',
              description: '控制 CLI 输出的详细程度。',
              key: 'system.observability.logging.level',
              component: {
                type: 'select',
                options: ['info', 'warn', 'error', 'debug'],
                placeholder: '选择日志等级',
              },
            },
            {
              type: 'field',
              id: 'logging-verbose',
              title: '启用 Verbose 模式',
              description: '输出更详细的调试日志。',
              key: 'system.observability.logging.verbose',
              component: {
                type: 'switch',
              },
            },
            {
              type: 'field',
              id: 'logging-output',
              title: '写入日志文件',
              description: '在 CLI 运行目录下输出构建日志文件，便于排查问题。',
              key: 'system.observability.logging.outputToFile',
              component: {
                type: 'switch',
              },
            },
          ],
        },
      ],
    },
  ],
}
