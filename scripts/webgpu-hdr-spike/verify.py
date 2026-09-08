"""Validate recorded behavioral evidence: python3 scripts/webgpu-hdr-spike/verify.py."""
import json
from pathlib import Path
runs = json.loads(Path(__file__).with_name('measurements.json').read_text())['runs']
for name, run in runs.items():
    assert run['pixels'] == 201326592, name
    assert not run['errors'], (name, run['errors'])
    assert run['visibility'] == run['visibilityAtEnd'] == 'visible', name
    assert run['rafMs']['n'] > 0, name
for name in ('gain', 'tiles'):
    assert runs[name]['hdrReadback']['channelsAboveOne'] > 0, name
assert runs['tiles']['texturePeakBytes'] <= 128 * 1024**2
assert any(p['channelsAboveOne'] > 0 for p in runs['tiles']['tileHDRReadbacks'])
print('PASS: four foreground runs, valid sample dimensions, explicit HDR output, HDR tiles, texture budget')
