"""Insert the generated matrix profile in both planes without re-encoding JPEG."""
from pathlib import Path
import struct

directory = Path(__file__).resolve().parent
image = (directory / "gainmap.jpg").read_bytes()
profile = (directory / "srgb-matrix.icc").read_bytes()
payload = b"ICC_PROFILE\0" + bytes([1, 1]) + profile
assert len(payload) + 2 <= 65535
assert image.count(b"\xff\xd8") == 2
segment = b"\xff\xe2" + struct.pack(">H", len(payload) + 2) + payload
(directory / "gainmap-icc.jpg").write_bytes(image.replace(b"\xff\xd8", b"\xff\xd8" + segment))
