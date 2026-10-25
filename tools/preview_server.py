#!/usr/bin/env python3
"""Serve the review pages for the Arena live preview (and for any plain browser).

    python3 tools/preview_server.py [port]        # default 8000, binds 0.0.0.0

Routes:

    /            the game itself (index.html) - or, with PREVIEW_PAGE=<repo-relative page>
                 set in the environment, that page instead (e.g. the skill-fx preview)
    /game        explicit alias for the game, always index.html
    /skillfx     the skill-effect sprite preview (every skill's RO-style effect, on demand)
    /bossfx      the boss skill-effect review (all twelve MVPs, two signature moves each)
    /damage      the damage-floats proposal page (on-screen damage numbers: 3 options)
    /crit        a live crit-frame comparison: the old misaligned burst vs the current one
    /weapons     the weapon proposal page (weapons on the class sprites)
    /review      the older weapon review page (drag a weapon where it looks wrong)
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
# '/' is THE GAME. The preview link the owner clicks has to land on the game itself - it used to
# open the weapon proposal page, which read as "the preview is broken". The dev pages keep their
# own routes underneath it. EXCEPTION: set PREVIEW_PAGE to a repo-relative page (e.g.
# PREVIEW_PAGE=tools/skill_fx_preview.html) and '/' serves that page instead - use it when a
# dev page IS the thing the owner should see, without un-pinning the game as the default.
_root_page = os.environ.get('PREVIEW_PAGE', 'index.html')
PAGES = {'/': _root_page,
         '/game': 'index.html',
         # the tuner pages (PR #29/#30) keep their own routes - they are tools, not the game
         '/skillfx': 'tools/skill_fx_preview.html',
         # every MVP's signature moves, on a live 3D field (loads the real assets/boss-fx.js)
         '/bossfx': 'tools/boss_fx_preview.html',
         '/overdrive': 'tools/skill-fx-proposals/prismatic-overdrive.html',
         '/fx': 'tools/skill-fx-proposals/prismatic-overdrive.html',
         '/damage': 'Updates/damage-floats-proposal/index.html',
         '/crit': 'Updates/crit-frame-compare/index.html',
         # the v83 RO-feel confirmation pages (proposal only - nothing in the game reads them)
         '/dmg2': 'Updates/damage-numbers-v2/index.html',
         '/dmg': 'Updates/damage-numbers-v2/index.html',
         '/numbers': 'Updates/damage-numbers-v2/index.html',
         '/spawn': 'Updates/spawn-field/index.html',
         '/weapons': 'tools/weapon_proposal.html',
         '/proposal': 'tools/weapon_proposal.html',
         '/review': 'tools/weapon_review.html',
         '/standalone': 'tools/weapon_review_standalone.html',
         '/picker': 'tools/sprite_picker.html',
         # the local GM door, without devtools (dev only - tools/ is in .assetsignore)
         '/gmsetup': 'tools/gm_setup.html'}


# The game ships with the new outdoor fields OPT-IN (`NATIVE_FIELDS_DEFAULT=false`, a recorded
# owner decision - see docs/DECISIONS.md), so the plain game URL shows the classic kit maps. That
# is correct for players and wrong for this preview: the owner opens the preview to look at the
# new fields and saw "still the old map". The server therefore flips that one constant ON while
# it serves the game, and only while it serves the game.
#
# `?nativeFields=0` still forces the classic maps, so both are one URL away from the preview.
_SHIPPING_FIELD_FLAG = b'const NATIVE_FIELDS_DEFAULT=false;'
_PREVIEW_FIELD_FLAG = b'const NATIVE_FIELDS_DEFAULT=true;'


def _preview_html(rel, body, query):
    """Apply preview-only defaults to a served page. Never writes to disk."""
    if rel != 'index.html' or 'nativeFields=0' in query:
        return body
    if _SHIPPING_FIELD_FLAG not in body:
        # The game stopped shipping that exact line. Serve it untouched rather than pretend:
        # a silent no-op here would look exactly like the bug this exists to fix.
        sys.stderr.write('WARNING: %s is missing %r - the new fields are not the preview default\n'
                         % (rel, _SHIPPING_FIELD_FLAG.decode()))
        return body
    return body.replace(_SHIPPING_FIELD_FLAG, _PREVIEW_FIELD_FLAG, 1)


class Handler(http.server.SimpleHTTPRequestHandler):
    def _page(self, rel, query=''):
        path = os.path.join(ROOT, rel)
        try:
            with open(path, 'rb') as fh:
                body = fh.read()
        except OSError as e:
            return self._err(500, 'cannot read %s (%s)' % (rel, e))
        body = _preview_html(rel, body, query)
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
        path, _, query = self.path.partition('?')
        if path in PAGES:
            return self._page(PAGES[path], query)
        return super().do_GET()

    def do_HEAD(self):
        path, _, query = self.path.partition('?')
        if path in PAGES:
            return self._page(PAGES[path], query)
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
    print('serving %s on 0.0.0.0:%d   ( / game WITH the new fields, /game?nativeFields=0 classic maps, '
          '/weapons proposal, /picker pose picker )' % (ROOT, port), file=sys.stderr, flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
