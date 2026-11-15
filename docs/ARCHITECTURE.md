# Field Shift — architecture

## Why the Streamlit version was replaced

Streamlit re-runs the whole page script on the server after every click and streams the result over a websocket.
Heavy pandas work and Plotly figures were rebuilt on each interaction, page switches reloaded modules, and the free
host put the app to sleep (30 s+ cold start). It also limited layout, language (no proper right-to-left Urdu) and
public deployment options.

## What replaced it

```
Browser ──► Next.js 16 on Vercel (App Router, TypeScript, Tailwind 4)
              │  static pages / partial prerendering for public pages (CDN)
              │  REST API routes (zod validation, rate limiting)
              ▼
         lib/engine  ── TypeScript port of the Python engine (pure functions, no I/O)
              ▲            verified against Python outputs: tests/golden (480 rotation evaluations)
              │
         lib/server  ── data loaders, NASA POWER / SRTM live fetch, land report, advice, market, plans
              │
         Postgres (Supabase or Neon)  — saved plans, feedback, NASA cache for new map points,
                                        AMIS price history, usage stats, rate limits
              ▲
         Vercel Cron (daily) ── /api/cron/amis scrapes Punjab AMIS prices

pipeline/ (Python, offline) ── downloads NASA archives (POWER, MODIS, SMAP, IMERG, SRTM, land cover),
                               trains the NDVI outlook model, exports data/generated/*.json and tests/golden/*.json
```

### Rendering

| Route | Rendering |
|---|---|
| `/[lang]` home | prerendered shell; live strip (forecasts, wheat price, weekly advice count) streamed |
| `/[lang]/advisor` | static shell; client component calls `POST /api/advice` (debounced, cancellable) |
| `/[lang]/land/[district]` | prerendered at build; 7-day forecast streamed at request time |
| `/[lang]/land/[lat,lon]` | rendered on request: NASA POWER + SRTM fetched live (≈3 s), cached in Postgres for 30 days |
| `/[lang]/market` | request time from Postgres |
| `/[lang]/trends`, `/methods` | static |
| `/[lang]/plan/[id]` | request time from Postgres (not indexed) |

### API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/advice` | rank rotations for a farm profile (district or coordinates, scenario, custom rotations) |
| GET | `/api/land?region=` or `?lat=&lon=` | NASA climate, NDVI, SMAP, rain check, trends, ML outlook |
| GET | `/api/land/csv?region=` | monthly NASA POWER table |
| GET | `/api/forecast?lat=&lon=` | 7-day forecast + farm tips (server-cached 1 h) |
| GET | `/api/market` | latest AMIS prices and history |
| POST | `/api/plans`, GET `/api/plans/:id` | save / read a shareable plan (result recomputed on the server) |
| POST | `/api/feedback` | helpful yes/no + optional comment |
| GET | `/api/stats` | anonymous activity counts |
| GET | `/api/health` | liveness + database connectivity |
| GET | `/api/cron/amis` | daily AMIS refresh (requires `CRON_SECRET`) |

### Security

- All input validated with strict zod schemas (unknown fields rejected, enums, numeric ranges, Pakistan-only coordinates,
  32 KB body limit, `application/json` only).
- Every SQL statement is parameterised. Tables have row-level security enabled with no policies, so Supabase's public
  REST API cannot read them; only the server connection (table owner) can.
- Rate limits in Postgres per hashed IP: advice 90/min, new NASA locations 12/h, plans 20/h, feedback 10/h.
- Errors return codes only (`invalid_input`, `rate_limited`, …), never stack traces.
- Secrets only in environment variables (`.env.example`); the cron endpoint compares its bearer token in constant time.
- Headers: CSP (scripts from this origin only, `connect-src 'self'`, map tiles from Esri), HSTS, `X-Frame-Options: DENY`,
  `nosniff`, strict referrer and permissions policies. The CSP uses `'unsafe-inline'` for scripts instead of nonces so
  pages stay statically prerendered (Next.js documents the trade-off); React escapes all user text and no
  `dangerouslySetInnerHTML` is used.
- No CORS headers are sent, so browsers block other origins from calling the API.

### Data flow for a new map point

1. `POST /api/advice` with `{lat, lon}` → rate-limit check for new locations.
2. Postgres `location_cache` (gzip JSON) hit → done in ~10 ms.
3. Miss → NASA POWER daily 2001→yesterday (≈1.4 MB) + SRTM 5×5 grid fetched in parallel, stored, then evaluated.

### Testing

`npm test` (Vitest, 143 tests): engine parity with Python (all scores, water, schedules, per-crop results, climate
analysis, NDVI windows, ML outlook, soil health), every engine fact translated into English and Urdu, Urdu dictionary
free of English words, AMIS parser parity with the Python scraper, input validation, forecast tips.
