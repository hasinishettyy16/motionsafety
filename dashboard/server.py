"""
server.py - Lightweight local web server for the Motion Safety Dashboard.
Serves dashboard files with proper MIME types for ES modules.
"""

import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def run_server(port=PORT):
    # Try the requested port or increment if occupied
    for current_port in range(port, port + 10):
        try:
            with socketserver.TCPServer(("", current_port), Handler) as httpd:
                print(f"============================================================")
                print(f"🚀 Motion Safety Dashboard running at: http://localhost:{current_port}")
                print(f"📂 Serving directory: {DIRECTORY}")
                print(f"⏹️  Press Ctrl+C to stop the server")
                print(f"============================================================")
                httpd.serve_forever()
                break
        except OSError as e:
            if e.errno == 10048 or "Address already in use" in str(e):
                print(f"Port {current_port} is busy, trying port {current_port + 1}...")
                continue
            else:
                raise e

if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port_arg)
