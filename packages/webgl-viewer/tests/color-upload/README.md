# WebGPU color upload regression

Run from an installed repository with a recent Node and Playwright Chromium:

```sh
PLAYWRIGHT_MODULE=/path/to/@playwright/test pnpm --filter @afilmory/webgl-viewer test:color-upload
BROWSER_CHANNEL=msedge PLAYWRIGHT_MODULE=/path/to/@playwright/test pnpm --filter @afilmory/webgl-viewer test:color-upload
BROWSER_CHANNEL=safari pnpm --filter @afilmory/webgl-viewer test:color-upload
```

Safari uses the installed macOS safaridriver and requires Remote Automation to be enabled beforehand.
The runner starts its own driver/session, does not change browser settings, and closes its resources.
Run browsers serially; `SAFARIDRIVER_PORT` defaults to 19616.
Generated bundles use a temporary directory; keep raw output and screenshots outside Git.

The test uses real ImageBitmap decoding, Canvas color conversion and GPU readback.
It covers sRGB to Display P3, saturated P3 outside sRGB, unpremultiplied alpha, canvas and JPEG sources, both texture formats used by the viewer, automatic path selection and forced explicit conversion.
The three-pixel-wide image also checks non-aligned row lengths.
Known color values provide an independent reference; decoded lossy JPEG pixels use Canvas P3 as their reference.
The tolerance is two 8-bit code values, allowing Canvas premultiplication and quantization.
An injected broken conversion must fail initialization and release its probe textures and buffers.

The workaround is selected per GPU device by testing an actual upload, without browser-name checks.
Conforming browsers keep the existing bitmap upload; affected browsers convert each base tile to P3 ImageData before uploading to a matching P3 destination.
Gain textures and HDR reconstruction are unchanged.
The probe validates the alternative path before selecting it; if neither path preserves color, the existing engine failure handling applies.

Explicit conversion adds a Canvas draw and CPU readback per base tile.
It requests float16, but older implementations return 8-bit ImageData and therefore retain an 8-bit precision/range limit.
This corrects the upload color space; it does not guarantee high-depth/HDR-primary preservation, fix native decoder/chroma interpolation differences, or add missing AVIF decoding APIs.
Display luminance and iOS are separate validation targets.
