#!/usr/bin/env python3
"""Real AVIF -> worker -> viewer engine -> float GPU output vs libavif.

Requires libavif 1.4.1 with gain-map support, pkg-config, C compiler, node and
Playwright Chromium. Set PLAYWRIGHT_MODULE for an externally installed package.
"""
import functools
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
    entry = tmp / 'entry.ts'
    entry.write_text('export { WebGPUImageViewerEngine } from ' + json.dumps(str(ROOT / 'packages/webgl-viewer/src/WebGPUImageViewerEngine')))
    dist = tmp / 'dist'
    config = tmp / 'vite.mjs'
    config.write_text('export default ' + json.dumps({'build': {'outDir': str(dist), 'emptyOutDir': True, 'lib': {'entry': str(entry), 'formats': ['es'], 'fileName': 'engine'}}}))
    subprocess.run([NODE, str(ROOT / 'node_modules/vite/bin/vite.js'), 'build', '--config', str(config)], cwd=ROOT, check=True)
    # Vite library fileName string receives .mjs/.js according to package context.
    engine = next(dist.glob('engine.*'))
    if engine.name != 'engine.js':
        engine.rename(dist / 'engine.js')
    for fixture in (ROOT / 'packages/webgl-viewer/src/fixtures').glob('gainmap-*.avif'):
        shutil.copyfile(fixture, dist / fixture.name)
    (dist / 'index.html').write_text('<!doctype html><link rel="icon" href="data:,"><title>AVIF engine verification</title>')
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(dist)))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        env = {**os.environ, 'UPSTREAM_ROOT': str(ROOT), 'AVIF_REFERENCE': str(reference), 'AVIF_TEST_URL': f'http://127.0.0.1:{server.server_port}'}
        result = subprocess.check_output([NODE, str(HERE / 'engine-readback.cjs')], env=env, text=True)
        print(result)
        output = ROOT / '.local/avif-verification/engine-readback.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(result)
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
