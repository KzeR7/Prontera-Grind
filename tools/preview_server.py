#!/usr/bin/env python3
"""Serve the review pages for the Arena live preview (and for any plain browser).

    python3 tools/preview_server.py [port]        # default 8000, binds 0.0.0.0

Routes:

    /            the weapon review page   (drag a weapon where it looks wrong)
    /review      the same page
    /standalone  the weapon review page with its data inlined (one file, no side requests)
    /picker      the attack pose + head picker (the owner's usual page)
    /<path>      anything else, served from the repo, so /tools/... and /assets/... work

Every page is answered DIRECTLY with 200 - no redirects anywhere.  A proxy sitting in
front of this can drop a 302 and leave the owner on a blank page (that is exactly what
"i cant access any of the links" looked like once), so the routes are real files, not
redirects.  This file lives in the repo on purpose: /tmp is wiped on every sandbox reset.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = {'/': 'tools/weapon_review.html',
         '/review': 'tools/weapon_review.html',
         '/standalone': 'tools/weapon_review_standalone.html',
         '/picker': 'tools/sprite_picker.html'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def _page(self, rel):
        path = os.path.join(ROOT, rel)
        try:
            with open(path, 'rb') as fh:
                body = fh.read()
        except OSError as e:
            return self._err(500, 'cannot read %s (%s)' % (rel, e))
        ctype = 'text/html; charset=utf-8' if rel.endswith('.html') else 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _err(self, code, msg):
        body = ('<!doctype html><meta charset="utf-8"><title>%d</title>'
                '<body style="background:#12141a;color:#e8ecf4;font:14px system-ui;padding:24px">'
                '<h1>%d</h1><p>%s</p>' % (code, code, msg)).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path in PAGES:
            return self._page(PAGES[path])
        return super().do_GET()

    def do_HEAD(self):
        path = self.path.split('?')[0]
        if path in PAGES:
            return self._page(PAGES[path])
        return super().do_HEAD()

    def end_headers(self):
        # never let the preview (or the owner's browser) keep a stale build
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '8000'))
    handler = functools.partial(Handler, directory=ROOT)
    print('serving %s on 0.0.0.0:%d   ( / weapon review, /picker pose picker )'
          % (ROOT, port), file=sys.stderr, flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
