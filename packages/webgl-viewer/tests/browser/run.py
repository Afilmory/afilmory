#!/usr/bin/env python3
"""Real AVIF -> worker -> viewer engine -> float GPU output vs libavif.

Requires libavif 1.4.1 with gain-map support, pkg-config, C compiler, node and
Playwright Chromium. Set PLAYWRIGHT_MODULE for an externally installed package.
"""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import threading

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
NODE = os.environ.get('NODE', 'node')
with tempfile.TemporaryDirectory(prefix='afilmory-avif-e2e-') as temporary:
    tmp = Path(temporary)
    reference = tmp / 'reference'
    flags = shlex.split(subprocess.check_output(['pkg-config', '--cflags', '--libs', 'libavif'], text=True))
    subprocess.run(['cc', str(HERE / 'render-reference.c'), *flags, '-o', str(reference)], check=True)
    encoder = tmp / 'encode-corpus'
    subprocess.run(['cc', str(HERE / 'encode-corpus.c'), *flags, '-o', str(encoder)], check=True)
    entry = tmp / 'entry.ts'
    entry.write_text('export { WebGPUImageViewerEngine } from ' + json.dumps(str(ROOT / 'packages/webgl-viewer/src/WebGPUImageViewerEngine')))
    if os.environ.get('AVIF_DIAGNOSTICS'):
        with entry.open('a') as stream:
            stream.write('; export { extractAVIFGainMap } from ' + json.dumps(str(ROOT / 'packages/webgl-viewer/src/avif-gainmap')))
    dist = tmp / 'dist'
    config = tmp / 'vite.mjs'
    config.write_text('export default ' + json.dumps({'build': {'outDir': str(dist), 'emptyOutDir': True, 'lib': {'entry': str(entry), 'formats': ['es'], 'fileName': 'engine'}}}))
    subprocess.run([NODE, str(ROOT / 'node_modules/vite/bin/vite.js'), 'build', '--config', str(config)], cwd=ROOT, check=True)
    # Vite library fileName string receives .mjs/.js according to package context.
    engine = next(dist.glob('engine.*'))
    if engine.name != 'engine.js':
        engine.rename(dist / 'engine.js')
    legacy = tmp / 'jpeg-legacy.ts'
    legacy.write_bytes(subprocess.check_output(['git', 'show', '9a0413ddefe02da95bea9218cb7961b09e47b143:packages/webgl-viewer/src/jpeg-gainmap.ts'], cwd=ROOT))
    legacy_config = {'resolve': {'alias': {'./jpeg-gainmap': str(legacy), 'fast-xml-parser': str(ROOT / 'packages/webgl-viewer/node_modules/fast-xml-parser/src/fxp.js')}}, 'build': {'outDir': str(dist), 'emptyOutDir': False, 'lib': {'entry': str(entry), 'formats': ['es'], 'fileName': 'engine-old'}}}
    config.write_text('export default ' + json.dumps(legacy_config))
    subprocess.run([NODE, str(ROOT / 'node_modules/vite/bin/vite.js'), 'build', '--config', str(config)], cwd=ROOT, check=True)
    old_engine = next(dist.glob('engine-old.*'))
    if old_engine.name != 'engine-old.js':
        old_engine.rename(dist / 'engine-old.js')
    for fixture in (ROOT / 'packages/webgl-viewer/src/fixtures').iterdir():
        if fixture.suffix in ('.avif', '.jpg'):
            shutil.copyfile(fixture, dist / fixture.name)
    baseline_cases = []
    baseline_reference = tmp / 'jpeg-baseline'
    if os.environ.get('JPEG_BASELINE') == '1':
        jpeg_flags = shlex.split(subprocess.check_output(['pkg-config', '--cflags', '--libs', 'libuhdr', 'libjpeg', 'libavif'], text=True))
        subprocess.run(['c++', '-std=c++17', str(HERE / 'jpeg-baseline.cpp'), *jpeg_flags, '-o', str(baseline_reference)], check=True)
        baseline_dir = ROOT / '.local/avif-verification/jpeg-baseline'
        baseline_dir.mkdir(parents=True, exist_ok=True)
        manifest = []
        for pattern in ('color', 'ramp'):
            for base_yuv in (420, 444):
                recipes = [(gain_yuv, ratio, False) for gain_yuv in (400, 420, 444) for ratio in (1, 2, 4)] + [(444, 2, True)]
                for gain_yuv, ratio, constant in recipes:
                    name = f'{pattern}-b{base_yuv}-g{gain_yuv}-r{ratio}' + ('-constant' if constant else '')
                    prefix = tmp / name
                    subprocess.run([str(baseline_reference), 'encode', str(prefix), pattern, str(base_yuv), str(gain_yuv), str(ratio), str(int(constant))], check=True)
                    for kind, ext in [('jpeg', 'jpg'), ('avif', 'avif')]:
                        case = f'baseline-{kind}-{name}'
                        filename = f'gainmap-{case}.{ext}'
                        data = prefix.with_suffix(f'.{ext}').read_bytes()
                        (dist / filename).write_bytes(data)
                        (baseline_dir / filename).write_bytes(data)
                        baseline_cases.append(case)
                        manifest.append({'case': case, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        (baseline_dir / 'manifest.json').write_text(json.dumps({
            'libraries': {lib: subprocess.check_output(['pkg-config', '--modversion', lib], text=True).strip() for lib in ('libuhdr', 'libjpeg', 'libavif')},
            'quality': 95, 'avifSpeed': 8, 'size': [32, 24], 'primaries': 'Display P3',
            'transfer': 'sRGB', 'workingSpace': 'base', 'gainMax': 8, 'gamma': 1, 'offsets': 0,
            'files': manifest,
        }, indent=2) + '\n')
    corpus = []
    for pattern in ('color', 'ramp'):
        source = dist / ('gainmap-color-12.avif' if pattern == 'color' else 'gainmap-12.avif')
        for depth in (8, 10, 12):
            for yuv in (420, 444):
                for full in (False, True):
                    name = f'corpus-{pattern}-{depth}-{yuv}-{"full" if full else "limited"}'
                    subprocess.run([str(encoder), str(source), str(dist / f'gainmap-{name}.avif'),
                                    str(depth), str(yuv), str(int(full)), '2', '32', '8', '444'], check=True)
                    corpus.append(name)
        # Vary gain encoding separately: avoid attributing ratio/chroma effects to base depth.
        for gain_depth in (8, 10, 12):
            for ratio, gain_yuv in ((1, 444), (4, 444), (2, 420)):
                name = f'corpus-{pattern}-gain-{gain_depth}-{gain_yuv}-ratio{ratio}'
                subprocess.run([str(encoder), str(source), str(dist / f'gainmap-{name}.avif'),
                                '10', '444', '1', str(ratio), '32', str(gain_depth), str(gain_yuv)], check=True)
                corpus.append(name)
    name = 'corpus-positive-base-headroom'
    subprocess.run([str(encoder), str(dist / 'gainmap-color-12.avif'), str(dist / f'gainmap-{name}.avif'),
                    '10', '444', '1', '2', '32', '8', '444', 'positive-base-headroom'], check=True)
    corpus.append(name)
    subprocess.run([str(encoder), str(dist / 'gainmap-color-12.avif'), str(dist / 'large.avif'),
                    '10', '420', '0', '2', '4096', '12', '444'], check=True)
    artifacts = ROOT / '.local/avif-verification'
    corpus_dir = artifacts / 'corpus'
    corpus_dir.mkdir(parents=True, exist_ok=True)
    encoded = []
    for name in [f'gainmap-{name}.avif' for name in corpus] + ['large.avif']:
        data = (dist / name).read_bytes()
        (corpus_dir / name).write_bytes(data)
        encoded.append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    (artifacts / 'corpus.json').write_text(json.dumps({
        'libavif': subprocess.check_output(['pkg-config', '--modversion', 'libavif'], text=True).strip(),
        'quality': 95, 'gainQuality': 95, 'speed': 8, 'files': encoded,
        'note': 'Synthetic re-encodes; bit depth denotes encoding, not preserved end-to-end precision.',
    }, indent=2) + '\n')
    (dist / 'index.html').write_text('<!doctype html><link rel="icon" href="data:,"><title>AVIF engine verification</title>')
    (dist / 'broken.avif').write_bytes(b'\x00\x00\x00\x20ftypavif')
    class Quiet(http.server.SimpleHTTPRequestHandler):
        worker_prefix = ''
        image_requests = []

        def end_headers(self):
            # Keep per-case requests and injected worker faults observable in Safari.
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def do_POST(self):
            if self.path != '/_test/control':
                self.send_error(404)
                return
            control = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            Quiet.worker_prefix = control.get('prefix', '')
            if control.get('reset'):
                Quiet.image_requests.clear()
            self.send_response(204)
            self.end_headers()

        def do_GET(self):
            if self.path == '/_test/requests':
                data = json.dumps(Quiet.image_requests).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if self.path.endswith(('.avif', '.jpg')):
                Quiet.image_requests.append(self.path)
            if Quiet.worker_prefix and self.path.startswith('/assets/webgpu-texture.worker-') and self.path.endswith('.js'):
                data = Quiet.worker_prefix.encode() + Path(self.translate_path(self.path)).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            super().do_GET()

        def log_message(self, *_args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(dist)))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        env = {**os.environ, 'UPSTREAM_ROOT': str(ROOT), 'AVIF_REFERENCE': str(reference),
               'AVIF_FIXTURES': str(dist), 'AVIF_CORPUS': json.dumps(corpus),
               'AVIF_TEST_URL': f'http://127.0.0.1:{server.server_port}'}
        if baseline_cases:
            env.update(FORMAT_BASELINE_CASES=json.dumps(baseline_cases), JPEG_REFERENCE=str(baseline_reference))
        result = subprocess.run([NODE, str(HERE / 'engine-readback.cjs')], env=env, text=True, capture_output=True)
        print(result.stdout)
        print(result.stderr)
        suffix = '-jpeg-baseline' if baseline_cases else ''
        if os.environ.get('AVIF_DIAGNOSTICS'):
            suffix += '-diagnostics'
        output = artifacts / f'engine-readback-{os.environ.get("BROWSER_CHANNEL", "chromium")}{suffix}.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        # A transport/setup failure must not erase the previous complete report.
        try:
            report = json.loads(result.stdout)
            if not isinstance(report.get('reports'), list):
                raise ValueError('Missing rendering reports')
        except (ValueError, AttributeError):
            output.with_suffix('.error.txt').write_text(result.stderr + '\n' + result.stdout)
        else:
            output.write_text(result.stdout)
            output.with_suffix('.error.txt').unlink(missing_ok=True)
        result.check_returncode()
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
