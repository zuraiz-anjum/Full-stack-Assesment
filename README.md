# RouteLog — HOS Trip Planner & ELD Log Generator

[![CI](https://github.com/zuraiz-anjum/Full-stack-Assesment/actions/workflows/ci.yml/badge.svg)](https://github.com/zuraiz-anjum/Full-stack-Assesment/actions/workflows/ci.yml)

Takes a trip (current location, pickup, drop-off, and how many hours are already
used in the driver's 70-hour/8-day cycle) and produces a driving route plus a
full set of FMCSA-compliant daily log sheets for the trip, including every
required rest break, 30-minute break, 10-hour reset, 34-hour restart, and fuel
stop along the way.

**Live app:** https://full-stack-assesment-smoky.vercel.app
**API:** https://full-stack-assesment-production.up.railway.app/api

## Screenshots

| Route + summary | Daily log sheet | Mobile |
|---|---|---|
| ![Trip overview](docs/screenshots/desktop-overview.jpg) | ![Daily log grid](docs/screenshots/desktop-daily-log.png) | ![Mobile form](docs/screenshots/mobile-form.png) |

## Features

- **Route planning** — geocodes the three locations, fetches a real HGV
  (heavy-goods-vehicle) driving route with turn-by-turn directions, and shows
  it on an interactive map with every stop marked.
- **FMCSA-accurate daily logs** — a full hours-of-service simulation, not a
  rough approximation: 11-hour driving limit, 14-hour window, 30-minute break
  after 8 hours driving, 10-hour resets, 34-hour restarts, 70-hour/8-day cycle
  tracking, and fuel stops every 1,000 miles. Rendered as a stepped-line grid
  matching the real paper log format, one sheet per calendar day.
- **Real PDF export** — a server-side endpoint renders each daily log as its
  own page with reportlab, laid out like the actual FMCSA form (grid, per-status
  totals, a 24-hour checksum, remarks, certification statement) — not just a
  browser print dialog.
- **Shareable read-only links** — hand a trip's route and logs to someone else
  (e.g. a dispatcher) via a link that needs no account, independent of your
  own trip history.
- **Mobile-first** — lazy-loaded map (cuts the initial JS payload by ~35%),
  responsive log grid with a swipe hint, auto-scroll to results.
- **Hardened for production** — CSP, HSTS, rate limiting, per-browser trip
  scoping (no visitor can see another visitor's trips), dependency-scanned
  (`npm audit` / `pip-audit`).
- **Tested** — 90 backend tests (HOS engine, log splitting, routing, the API's
  HTTP contract, PDF generation, trip-scoping) and 27 frontend tests, both run
  on every push via GitHub Actions.

## Architecture

```mermaid
flowchart LR
    subgraph Client
        FE["React SPA (Vercel)"]
    end
    subgraph Server["Railway"]
        API["Django REST API"]
        DB[("PostgreSQL")]
    end
    ORS["OpenRouteService<br/>(geocoding + HGV routing)"]
    OSM["OpenStreetMap<br/>(map tiles)"]

    FE -- "HTTPS + X-Owner-Token" --> API
    API --> DB
    API -- "geocode / route" --> ORS
    FE -- "tiles" --> OSM
```

## Stack

- **Backend:** Django + Django REST Framework, PostgreSQL (Railway)
- **Frontend:** React (Vite) + Tailwind CSS, react-leaflet for the map
- **Routing/geocoding:** OpenRouteService (HGV driving profile, US-only)
- **PDF generation:** reportlab
- **Hosting:** Railway (backend + Postgres), Vercel (frontend)
- **CI:** GitHub Actions (backend + frontend test suites, lint, build)

## How it works

1. The three locations get geocoded (restricted to the US, since that's what
   the FMCSA rules here apply to), and a driving route is fetched for each leg
   (current → pickup, pickup → drop-off) using OpenRouteService's HGV profile,
   including turn-by-turn instructions.
2. The trip's start time is resolved to the driver's actual local wall clock
   (via the current location's longitude — see `tz_resolver.py`), not the
   server's clock, since HOS rules run on wall-clock time at the driver's
   location.
3. The route legs are fed into an hours-of-service simulation engine
   (`backend/trips/services/hos_engine.py`) that walks the trip
   constraint by constraint and inserts every rest period the regulations
   require: a 30-minute break after 8 cumulative hours of driving, a 10-hour
   reset once the 11-hour driving or 14-hour window limit is hit, a fuel stop
   every 1,000 miles, and a 34-hour restart if the 70-hour/8-day cycle runs
   out.
4. The resulting timeline is split into calendar days (`log_builder.py`) and
   each day becomes one log sheet: per-status time totals, per-day mileage,
   a stepped duty-status graph, and remarks showing where each status change
   happened (reverse-geocoded from the route geometry, resolved to the
   *departure* point of each segment, not the arrival point).
5. Everything is returned as one JSON payload and rendered client-side — the
   map, turn-by-turn directions, summary cards, and a hand-built SVG replica
   of the FMCSA daily log grid, including the carrier/vehicle/shipper fields
   the real form requires (all optional inputs on the trip form). Log sheets
   can be downloaded as a real PDF (`pdf_builder.py`, server-rendered) or
   printed directly from the browser.

## Assumptions

Per the assignment brief:

- Property-carrying driver on the 70-hour/8-day cycle, no adverse driving
  conditions exception applied.
- A fuel stop is scheduled at least once every 1,000 miles.
- Pickup and drop-off each take 1 hour, logged as on-duty (not driving).
- The 30-minute mandatory break is logged as off-duty; 10-hour resets and
  34-hour restarts are logged as sleeper berth (both count identically
  toward the HOS limits — this only affects which grid row they show up on).
- Trip start time defaults to the driver's local "now," resolved from the
  current location; there's no input for a scheduled future start time.
- Timezone resolution is longitude-based (not true geographic boundaries),
  which is accurate for the vast majority of US locations but can be off by
  one zone right at a state border.
- No user accounts. Each browser gets an anonymous token (stored in
  localStorage) that scopes its own trip history server-side — see
  `ownerToken.js` / the `owner_token` field on `Trip`.

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate    # or venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # then fill in ORS_API_KEY
python manage.py migrate
python manage.py runserver
```

`ORS_API_KEY` is a free key from https://openrouteservice.org/dev — sign up,
request a token, paste it into `.env`.

Run the backend test suite (HOS engine, daily-log splitting, geometry helpers,
timezone resolution, PDF generation, the trip-planning orchestration layer
with routing mocked out, and the API's HTTP contract):

```bash
python manage.py test trips
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_BASE_URL, defaults to localhost:8000/api
npm run dev
```

Run the frontend test suite (Vitest + React Testing Library):

```bash
npm run test
```

## API

There's no user auth — every request from the frontend carries an
`X-Owner-Token` header (a random UUID generated once per browser and stored
in localStorage) that scopes trip history and detail lookups to that browser.
A request with no token, or someone else's token, gets an empty list / 404,
never another visitor's data.

- `POST /api/trips/` — plan a trip. Required body: `current_location`,
  `pickup_location`, `dropoff_location`, `current_cycle_used_hours`. Optional:
  `carrier_name`, `main_office_address`, `truck_number`, `trailer_number`,
  `driver_name`, `co_driver_name`, `shipping_doc_number` (used only to fill
  out the printed log sheet's header fields). Returns the full route,
  turn-by-turn directions, stop list, daily logs, and a `share_token` for the
  read-only link; persists the trip under the caller's owner token.
  Rate-limited to 20 requests/hour per IP.
- `GET /api/trips/` — the calling browser's own recent trip history (most
  recent 20), scoped by `X-Owner-Token`.
- `GET /api/trips/<id>/` — a previously planned trip (owner-token scoped).
- `GET /api/trips/<id>/pdf/` — the trip's daily logs as a real PDF, one page
  per day (owner-token scoped).
- `GET /api/shared/<share_token>/` — public, read-only lookup by a trip's
  share token — no owner token required. Doesn't echo the token back.
- `GET /api/shared/<share_token>/pdf/` — same PDF export, public.
- `GET /api/locations/autocomplete/?q=` — location suggestions for the form.
  Rate-limited to 60 requests/minute per IP.
