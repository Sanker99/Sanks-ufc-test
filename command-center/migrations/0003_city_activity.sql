-- Run against the isolated sanks-command-center-test D1 database before deploying city tracking.
-- City and coordinates are approximate Cloudflare geolocation; no IP or GPS is stored.
CREATE TABLE IF NOT EXISTS event_cities (
  event_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL,
  lat REAL,
  lon REAL
);
CREATE INDEX IF NOT EXISTS event_cities_state ON event_cities(country,state,city);
