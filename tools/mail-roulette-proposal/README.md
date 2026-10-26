# Mail / roulette / active-effects UI proposal

Proposal-only review pages; no game imports, API calls or save mutations.

The owner-facing visuals, scope, reference links, implementation notes and check results live in
[the design proposal](../../docs/proposals/mail-roulette-2026-10-26/README.md).

```sh
PREVIEW_PAGE=tools/mail-roulette-proposal/index.html python3 tools/preview_server.py 8000
```

Open the preview root for the interactive demo. `#mail`, `#roulette`, `#buffs` and `#gm`
select a screen. `/tools/mail-roulette-proposal/review.html` is the printable four-page review.

With that server running, reproduce the screenshots and PDF with:

```sh
node tools/check_mail_roulette_proposal_browser.cjs http://127.0.0.1:8000 --capture
```

The linked proposal documents the optional browser dependencies and test boundaries.
This directory is not included in `dist/`. Do not connect this demonstration to accounts or
ship the synthetic messages/scripted spin as game logic.
