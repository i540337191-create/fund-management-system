#!/bin/sh
set -eu
node -e "import('./dist/config.js').then(m=>{if(process.env.APP_AUTH_MODE!=='password')process.exit(1);m.validateServerConfig()}).catch(()=>process.exit(1))"
python3 scripts/prepare-storage.py
exec gosu node node scripts/start-container.mjs
