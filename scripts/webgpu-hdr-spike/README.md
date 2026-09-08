# 200MP HDR WebGPU spike

独立实验，不接入正式图片预览器，不修改 Live Photo。页面按钮运行相同的 15 秒 fit → 原图 1 CSS px/像素 → 大范围拖动 → fit 轨迹。

## 复跑

使用本机已安装的 Node、Sharp、ExifTool、Python 和带硬件 WebGPU 的 Chrome。libultrahdr 仅作为离线样本封装工具，不加入产品依赖。

```sh
git clone https://github.com/google/libultrahdr.git /tmp/afilmory-hdr-lib
# 本次版本：418b6b361e252a91c435a56cf386afb37d7d1c9d
cmake -S /tmp/afilmory-hdr-lib -B /tmp/afilmory-hdr-lib/build \
  -DCMAKE_BUILD_TYPE=Release -DUHDR_MAX_DIMENSION=32768 \
  -DUHDR_BUILD_TESTS=OFF -DUHDR_BUILD_EXAMPLES=ON
cmake --build /tmp/afilmory-hdr-lib/build -j 8
node scripts/webgpu-hdr-spike/prepare.mjs /tmp/afilmory-hdr-lib/build/ultrahdr_app
python3 scripts/webgpu-hdr-spike/server.py
```

打开 http://127.0.0.1:8794，依次运行四个按钮。每次测量前刷新页面以释放上一次的 GPU 资源。测试时保持窗口可见，避免截图、其他 GPU 负载和窗口尺寸变化。`POST /result` 自动把结果保存到 `results/assets/`。准备脚本不修改原照片；生成的大图和结果均已 gitignore。

## 四条路径

- DOM：浏览器原生 `<img>` 显示完整 Ultra HDR JPEG，以 CSS transform 执行轨迹。没有接入产品的手势/React 逻辑。
- native：完整 Ultra HDR JPEG 通过 `copyExternalImageToTexture` 导入 `rgba16float`。
- gain：底图与 gain map 分别导入两张 `rgba8unorm`，shader 在线性 Display P3 中恢复增益，再转换为输出画布所需的编码值。
- tiles：Worker 解码完整底图与 gain map，运行时裁剪和缩放可见瓦片；LOD 为 1/16、1/8、1/4、1/2、1，最大不超过原图。1024 px 底图瓦片与对应的 256 px gain map 瓦片成对上传，最多两个在途请求，128 MiB GPU 图片纹理预算。

三条 WebGPU 路径统一使用 `rgba16float` / `display-p3` / `toneMapping: extended` 画布。gain shader **仅适用于该样本**：gain min=0、max=log2(5.00001)、gamma=1、offset=0、SDR base、使用底图色域。不是通用 Ultra HDR 解码器；采用完整增益，不模拟不同屏幕 headroom 的原生适配。

## 样本与边界

- 源文件：仓库 `photos/IMG_20251111_002156.jpg`，3072×4096，真实 HDR gain map。底图与 gain map 同步重采样后由 Google libultrahdr 重新封装。
- 测试 JPEG：12288×16384 = 201,326,592 像素，约 12 MB。它是重采样的 HDR 压力样本，**不是原生 2 亿像素拍摄**；内容主要是天花板和灯具，压缩与解码耗时不代表高纹理复杂度照片的最坏情况。
- gain/tiles 使用离线从样本分离的底图、gain map，以及缩小的 overview，以隔离渲染成本；**没有测量浏览器运行时解析单个 JPEG、提取元数据及生成 overview 的成本**。高清瓦片本身全部运行时生成。
- 分块依然完整解码原图。纹理预算不等于浏览器或 GPU 进程总内存：它不包含 CPU 解码缓冲、画布、驱动内部副本和临时 bitmap。
- `img.decode()` 的 Promise 耗时不一定覆盖后续延迟解码。原生路径的上传时间可能包含延迟解码；tiles 的 Worker decode 单独记录。
- `firstSetupMs` 是资源准备完成时间，不是经过合成器确认的首帧时间。tiles 的低清底图可先出现，Worker decode 不在此时间内。
- rAF 间隔只代表回调节奏；另采 Chrome compositor trace 交叉检查。没有把它直接等同于屏幕呈现 FPS。
- readback 证明测试纹理含有超过 SDR 白的数值，不是 HDR 屏幕亮度测量，也没有证明所有色彩/元数据格式正确。
- 当前 LOD 切换时退回 overview，没有实现跨层级父瓦片保留、边缘 gutter、平滑清晰度切换、设备丢失恢复和可交互手势。这是 spike 的已知范围，不是生产实现。

实测摘要见 `RESULTS.md`。机器原始结果保存在 `results/`，本次性能轨迹位于 `/tmp/afilmory-dom-trace.json` 与 `/tmp/afilmory-tiles-trace.json`。

## Production integration checks

`production.test.ts` exercises the production JPEG parser, malformed metadata, runtime LOD coverage and texture budget. It uses the repository's real Xiaomi HDR JPEG and Node's built-in test runner:

```sh
pnpm exec tsx --test scripts/webgpu-hdr-spike/production.test.ts
```

`production-browser.tsx` is a development-only test harness for the actual `ImageViewer` and `ProgressiveImage`, including fault injection and float16 readback. Start the gallery with `pnpm --filter @afilmory/web exec vite --host 127.0.0.1 --port 5186`, open its home page, then dynamically import the harness through Vite's `/@fs/<absolute-repository-path>/scripts/webgpu-hdr-spike/production-browser.tsx` URL. It expects the generated `fixtures/hdr-201mp.jpg` from the preparation step above. The module exports:

- `mount()` / `status()` / `zoom()` / `reset()` / `unmount()` for loading and lifecycle checks.
- `mount({mode: 'absent'})`, `mount({mode: 'adapter'})`, and `lose()` for WebGPU fallback checks.
- `readHDR()` for actual canvas float16 readback; expect output above 1 on an HDR display.
- `mount({progressive: true, src: '/photos/IMG_5484.HEIC', video: '/photos/IMG_5484.mov'})` for the real Live Photo overlay and autoplay path.

The harness patches browser constructors for measurement and fault injection. Reload the page when finished. It is never imported by the shipped application.
