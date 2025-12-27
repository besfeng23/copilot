## Memory Vault v1 — `memory-etl` (Facebook export → Memory Pack)

This package builds a **portable Memory Pack** folder:

```
/memorypacks/<packId>/
  manifest.json
  store.sqlite
  vectors.lance/
  media_map.json
```

### Install (Windows PowerShell)

From repo root:

```powershell
cd $env:USERPROFILE\Documents\dev\copilot
cd packages\memory-etl
npm ci
```

### Ingest (Facebook export → Memory Pack)

```powershell
cd $env:USERPROFILE\Documents\dev\copilot
npm run memory:ingest -- --input "C:\path\to\facebook-export" --out ".\memorypacks\PACK_ID"
```

### Embed (Memory Pack → vectors.lance)

```powershell
$env:OPENAI_API_KEY="..."   # do not commit
npm run memory:embed -- --pack ".\memorypacks\PACK_ID" --model "text-embedding-3-large"
```

### Verify

```powershell
npm run memory:verify -- --pack ".\memorypacks\PACK_ID"
```

### Sync to Firebase (optional)

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_JSON="..."  # JSON string; do not commit
$env:FIREBASE_STORAGE_BUCKET="..."
npm run memory:sync -- --pack ".\memorypacks\PACK_ID"
```

### Notes

- The ETL is **streaming**: it never loads multi-GB JSON arrays fully into memory.
- Missing Facebook paths are logged as warnings and ingestion continues.
- No secret values are logged. Only variable *names* are reported when missing.


