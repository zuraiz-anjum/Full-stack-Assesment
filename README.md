# RouteLog — HOS Trip Planner & ELD Log Generator

Takes a trip (current location, pickup, drop-off, and how many hours are already
used in the driver's 70-hour/8-day cycle) and produces a driving route plus a
full set of FMCSA-compliant daily log sheets for the trip, including every
required rest break, 30-minute break, 10-hour reset, 34-hour restart, and fuel
stop along the way.

**Live app:** https://full-stack-assesment-smoky.vercel.app
**API:** https://full-stack-assesment-production.up.railway.app/api

## Stack

- **Backend:** Django + Django REST Framework, PostgreSQL (Railway)
- **Frontend:** React (Vite) + Tailwind CSS, react-leaflet for the map
- **Routing/geocoding:** OpenRouteService (HGV driving profile)
- **Hosting:** Railway (backend + Postgres), Vercel (frontend)

## How it works

1. The three locations get geocoded, and a driving route is fetched for each
   leg (current → pickup, pickup → drop-off) using OpenRouteService's HGV
   profile.
2. The route legs are fed into an hours-of-service simulation engine
   (`backend/trips/services/hos_engine.py`) that walks the trip minute by
   minute (well, constraint by constraint) and inserts every rest period the
   regulations require: a 30-minute break after 8 cumulative hours of
   driving, a 10-hour off-duty reset once the 11-hour driving or 14-hour
   window limit is hit, a fuel stop every 1,000 miles, and a 34-hour restart
   if the 70-hour/8-day cycle runs out.
3. The resulting timeline is split into calendar days
   (`log_builder.py`) and each day becomes one log sheet: per-status time
   totals, a stepped duty-status graph, and remarks showing where each status
   change happened (reverse-geocoded from the route geometry).
4. Everything is returned as one JSON payload and rendered client-side — the
   map, the summary cards, and a hand-built SVG replica of the FMCSA daily
   log grid.

## Assumptions

Per the assignment brief:

- Property-carrying driver on the 70-hour/8-day cycle, no adverse driving
  conditions exception applied.
- A fuel stop is scheduled at least once every 1,000 miles.
- Pickup and drop-off each take 1 hour, logged as on-duty (not driving).
- The 30-minute mandatory break and 10-hour resets are logged as off-duty.
- Trip start time defaults to the moment the request is made; the app
  doesn't currently take a scheduled start time as input.

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

Run the test suite (mostly the HOS engine, since it's the part where
correctness actually matters):

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

## API

- `POST /api/trips/` — plan a trip. Body: `current_location`,
  `pickup_location`, `dropoff_location`, `current_cycle_used_hours`. Returns
  the full route, stop list, and daily logs, and persists the trip.
- `GET /api/trips/` — recent trip history (most recent 20).
- `GET /api/trips/<id>/` — a previously planned trip.
- `GET /api/locations/autocomplete/?q=` — location suggestions for the form.
