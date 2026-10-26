import http.server, sys, time, os, urllib.parse
# Uso: python3 server.py <raíz de la extensión> <carpeta de trabajo con sites/N.png>
ROOT, WORK = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def send(self, data, ct):
        self.send_response(200); self.send_header("Content-Type",ct); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        p = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(p.query)
        if p.path == "/slow":
            time.sleep(float(q.get("t",["1.5"])[0])); return self.send(b"GIF89a\x01\x00\x01\x00\x00\x00\x00;", "image/gif")
        if p.path.startswith("/sites/"):
            return self.send(open(os.path.join(WORK, p.path[1:]),"rb").read(), "image/png")
        if p.path in ("/mock.js","/demo.js"):
            return self.send(open(os.path.join(HERE, p.path[1:]),"rb").read(), "text/javascript")
        if p.path=="/harness.html":
            mock = q.get("mock",["mock"])[0]
            html=open(os.path.join(ROOT,"expose.html")).read().replace('<script src="expose.js">',f'<script src="{mock}.js"></script><script src="expose.js">')
            html=html.replace("</head>",'<style>.card.demo-hover .thumb{transform:scale(1.025);box-shadow:var(--shadow-hover)}.card.demo-hover .close{opacity:1;transform:none}.card.demo-hover .label{color:var(--text)}</style></head>')
            html=html.replace("</body>",f'<img src="/slow?t={q.get("wait",["1.5"])[0]}" style="position:fixed;width:1px"></body>')
            return self.send(html.encode(), "text/html")
        return super().do_GET()
os.chdir(ROOT)
http.server.ThreadingHTTPServer(("127.0.0.1",8765),H).serve_forever()
