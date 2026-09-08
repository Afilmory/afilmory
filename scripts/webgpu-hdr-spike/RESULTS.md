# 201.3MP HDR JPEG spike — 2026-09-08

结论：这台设备上，**运行时分块 + WebGPU gain map 合成**值得继续。仅把完整 HDR JPEG 导入浮点纹理还不成立：Chrome 152 的测试路径没有保留 gain map 高光。

设备：Apple M4 Max / 128 GB，Chrome 152.0.0.0 有界面、前台运行，Apple Metal 硬件适配器，无软件回退。显示器报告 HDR，DPR=2，绘制区域 2400×1856 物理像素，观察到约 60Hz rAF 节奏。

样本：真实 12.6MP HDR JPEG 的底图与 gain map 同步重采样、重新封装为 12288×16384（201,326,592 像素，约 12 MB）的 JPEG。libultrahdr probe 确认 Ultra HDR，有效最大增益 5.00001。不是原生 200MP 摄影样本。

## 第二轮，未开启 profiler

每条路径相同的 15 秒轨迹：5 秒从 fit 放大到原图 1 CSS px/像素，5 秒大范围拖动，5 秒缩回 fit。每次刷新释放前一次资源；浏览器 HTTP/图像缓存可能保留，因此不是冷启动对比。

| 路径 | rAF P99 | 最长 rAF 间隔 | >50ms 次数 | 图片纹理峰值 | HDR 读回 |
|---|---:|---:|---:|---:|---|
| DOM `<img>` | 33.4ms | 300ms | 7 | 未测量 | 浏览器原生显示，未读回 |
| 原生导入整图 `rgba16float` | 17.7ms | 17.8ms | 0 | 1536 MiB | 最大=1，高光丢失 |
| 底图 + gain map 整图合成 | 17.7ms | 17.8ms | 0 | 816 MiB | 最大约 2.00，保留高光 |
| Worker 动态分块 + gain map | 17.7ms | 17.8ms | 0 | 126.4 MiB | 高清瓦片最大约 2.01，保留高光 |

这些 rAF 数据不是屏幕呈现 FPS。相对整图双纹理，分块降低约 84.5% 的**图片纹理**驻留量；这不是整个进程内存的降幅。

分块 Worker 整图解码约 308ms。171 个瓦片生成任务，中位数 3.1ms，P95 4.8ms，最长 8.3ms。纹理上传调用 P95 0.3ms，最长 1.4ms。整图合成的准备过程约 471ms，最大一次纹理上传调用阻塞约 309ms。

DOM `img.decode()` 只用了约 18ms，但后续缩放仍触发显著解码/栅格化成本。因此不能用 decode Promise 或 DOM 插入完成时间冒充显示就绪时间。

## Chrome trace 交叉检查

第一轮分别对 DOM 与最终动态分块版本记录性能轨迹，仅统计 trajectory-start 到 trajectory-end 的事件：

- DOM：22 个 `DroppedFrame` 事件未标记 partial update，38 个标记 partial update；827 个 `Display::FrameDisplayed` 事件。3 个 `GpuImageDecodeCache::DecodeImage` 任务最长约 260ms。
- 动态分块：没有 `DroppedFrame` 事件；901 个 `Display::FrameDisplayed` 事件。此区间没有上述主图像缓存解码事件，解码在 Worker 路径完成。
- 这些是 Chromium trace 事件计数，不能直接作为精确的面板丢帧率。
- 更早的探索轮曾在分块路径观察到 149.5ms 间隔，当时插入了工具查询和截图。后续带 trace 与不带 trace 的两轮均未复现；没有把该次异常静默当作不存在。

另对原始 3072×4096 HDR JPEG 的原生浮点导入读取完整纹理，也没有 >1 的正值通道。说明此次原生导入问题并非只有 200MP 尺寸才触发。

## 架构含义与未验证项

1. 保留实时瓦片的方向；不需要预生成所有瓦片。LOD 上限应为原图分辨率，不生成 2×/4× 插值瓦片。
2. 当前浏览器的 gain map 提取/合成需要明确处理。此 spike 的显式合成路径使用离线分离的底图和 gain map，并使用预生成的低清 overview。运行时 JPEG 拆包与 overview 生成尚未计入。
3. 即使只驻留 126 MiB GPU 图片纹理，仍需整图 CPU 解码，未证明低内存移动设备可以承受。128GB M4 Max 的结果不能外推到手机。
4. 该 shader 仅处理此样本的元数据；完整色彩准确性、屏幕 headroom 适配、不同 HDR 编码、Safari、移动端、跨层级清晰度连续性和设备丢失恢复尚未验证。
5. 原生 HDR 画布输出已配置，读回证明高光数据存在，但没有进行光度计测量。截图不能证明实际 HDR 亮度。
6. 图片与 Live Photo 视频仍可共享视口矩形，本次没有修改产品代码或播放器。

可复核数据：`measurements.json`；运行 `python3 scripts/webgpu-hdr-spike/verify.py` 检查采样尺寸、前台执行、GPU 错误、HDR 瓦片和纹理预算。运行方法见 `README.md`。

验收报告：https://app.lobehub.com/acceptance/648c35a5-a424-44c8-9698-bda558672460
本轮：https://app.lobehub.com/acceptance/648c35a5-a424-44c8-9698-bda558672460?r=1
证据覆盖：3/3 项，11 份证据已上传并核对；原生 HDR 导入能力记录为失败。
