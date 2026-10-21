// services/geo.js — place search, reverse geocoding and road routing.
// Default providers: Nominatim (search) + OSRM (routing), both OpenStreetMap-based
// and free. Swap the URLs in config/appConfig.js (GEOCODER_URL / ROUTING_URL).
//
// Usage-policy safeguards for the public Nominatim server:
//   • at most 1 request per second (requests are queued)
//   • identifying User-Agent
//   • results cached, so repeated searches don't hit the server again
const config = require("../config/appConfig");
const { haversine } = require("../utils/routeDeviation");

const geo = config.geo;

// ── Small TTL cache ──────────────────────────────────────────────────────────
const cache = new Map();
const MAX_CACHE = 500;
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + geo.cacheMinutes * 60 * 1000 });
  return value;
};

// ── 1 request / second queue for the geocoder ────────────────────────────────
let lastGeocoderCall = Promise.resolve();
const throttled = (fn) => {
  const run = lastGeocoderCall.then(fn);
  lastGeocoderCall = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, 1100)));
  return run;
};

class GeoError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

const getJson = async (url) => {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": geo.userAgent, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new GeoError("The map service could not be reached. Check the internet connection.", 503);
  }
  if (!res.ok) throw new GeoError(`The map service returned an error (${res.status}).`, 502);
  return res.json();
};

const round = (n, d = 5) => Math.round(n * 10 ** d) / 10 ** d;

// Shorter, readable label from a Nominatim result
const shortName = (r) => {
  const a = r.address || {};
  const first = r.name || a.road || a.neighbourhood || a.suburb || r.display_name?.split(",")[0];
  const area = a.suburb || a.neighbourhood || a.city_district || a.town || a.city;
  return [first, area && area !== first ? area : null].filter(Boolean).join(", ");
};

const toPlace = (r) => ({
  id:      String(r.place_id),
  name:    shortName(r) || r.display_name,
  address: r.display_name,
  lat:     round(Number(r.lat)),
  lng:     round(Number(r.lon)),
});

// ── Search places (biased towards `near`, limited to Pakistan) ───────────────
exports.search = async (query, near = geo.defaultCenter) => {
  const q = String(query || "").trim();
  if (q.length < 3) throw new GeoError("Type at least 3 characters to search.", 400);
  const box = 0.6; // ≈ 60 km around `near` — preferred, not a hard limit
  const params = new URLSearchParams({
    q, format: "jsonv2", addressdetails: "1", limit: "8",
    countrycodes: geo.countryCodes,
    viewbox: [near.lng - box, near.lat + box, near.lng + box, near.lat - box].join(","),
  });
  const key = `s:${q.toLowerCase()}:${round(near.lat, 1)}:${round(near.lng, 1)}`;
  return cached(key, () => throttled(async () => {
    const results = await getJson(`${geo.geocoderUrl}/search?${params}`);
    const places = [];
    for (const p of results.map(toPlace)) {
      // Same name within 500 m (e.g. a market's building + its car park) → keep one
      const dup = places.some(q => q.name === p.name && haversine(q.lat, q.lng, p.lat, p.lng) < 0.5);
      if (!dup) places.push({ ...p, distanceKm: Math.round(haversine(near.lat, near.lng, p.lat, p.lng) * 10) / 10 });
    }
    return places;
  }));
};

// ── Address for a coordinate ─────────────────────────────────────────────────
exports.reverse = async (lat, lng) => {
  const params = new URLSearchParams({ lat, lon: lng, format: "jsonv2", addressdetails: "1", zoom: "18" });
  return cached(`r:${round(lat, 4)}:${round(lng, 4)}`, () => throttled(async () => {
    const r = await getJson(`${geo.geocoderUrl}/reverse?${params}`);
    if (r.error) return { name: "Pinned location", address: `${round(lat)}, ${round(lng)}`, lat, lng };
    return { ...toPlace(r), lat: round(lat), lng: round(lng) };
  }));
};

// ── Road routes (with alternatives) between two points ───────────────────────
// Returns [{ index, distanceKm, durationMin, coordinates: [[lat, lng], ...], summary }]
exports.routes = async (from, to) => {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({
    alternatives: String(geo.maxAlternatives), overview: "full", geometries: "geojson", steps: "false",
  });
  const key = `rt:${round(from.lat, 4)},${round(from.lng, 4)}>${round(to.lat, 4)},${round(to.lng, 4)}`;
  return cached(key, async () => {
    const data = await getJson(`${geo.routingUrl}/route/v1/driving/${coords}?${params}`);
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new GeoError(data.code === "NoRoute" ? "No road route was found between these places." : "Route could not be calculated.", 422);
    }
    return data.routes.slice(0, geo.maxAlternatives).map((r, index) => ({
      index,
      distanceKm:  Math.round(r.distance / 100) / 10,
      durationMin: Math.max(1, Math.round(r.duration / 60)),
      summary:     r.legs?.[0]?.summary || "",
      // GeoJSON is [lng, lat] — return [lat, lng] for the app
      coordinates: r.geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)]),
    }));
  });
};

exports.GeoError = GeoError;
