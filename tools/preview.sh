#!/usr/bin/env bash
# The one way to start the preview the owner tests in. It always includes the two flags that
# keep sign-in working across sessions:
#   --preview-auth   the X-Preview-Session header bridge, because the embedded (iframed/proxied)
#                    preview loses its session cookie when the browser blocks third-party cookies;
#                    without it, login "succeeds" and then every request 401s into a bogus
#                    "signed in on another device". Accounts stay ordinary players (no GM).
#   --db ...         accounts and saves persist in tools/.devdb/preview.sqlite (git-ignored), so
#                    restarting the server never wipes the owner's test account again.
# Usage: tools/preview.sh [extra dev_server args]   (PORT=8788 by default)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tools/.devdb
exec node tools/dev_server.js --port "${PORT:-8788}" --preview-auth --db tools/.devdb/preview.sqlite "$@"
