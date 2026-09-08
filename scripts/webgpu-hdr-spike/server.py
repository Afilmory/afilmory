from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/result':
            self.send_error(404); return
        import json, time
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        name = str(data.get('mode','probe')).replace('/','_')
        Path(f'results/assets/{name}-{time.time_ns()}.json').write_text(json.dumps(data,indent=2))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
ThreadingHTTPServer(('127.0.0.1',8794),Handler).serve_forever()
