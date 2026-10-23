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

// ── Nearby safe places from OpenStreetMap (Overpass API) ───────────────────
// police: police stations · hospital: hospitals/clinics · public: staffed,
// busy public places (malls, markets, fuel stations, pharmacies)
const SAFE_TAGS = {
  police:   ['["amenity"="police"]'],
  hospital: ['["amenity"="hospital"]', '["amenity"="clinic"]'],
  public:   ['["shop"="mall"]', '["amenity"="marketplace"]', '["amenity"="fuel"]', '["amenity"="pharmacy"]'],
};
const typeOf = (t = {}) =>
  t.amenity === "police" ? "police"
  : (t.amenity === "hospital" || t.amenity === "clinic") ? "hospital"
  : "public";

// Fallback for safePlaces: Nominatim keyword search inside a box around `near`
const NOMINATIM_TERMS = { police: ["police"], hospital: ["hospital"], public: ["mall", "pharmacy"] };
const safePlacesViaNominatim = async (near, types, radiusM) => {
  const dLat = radiusM / 111320, dLng = radiusM / (111320 * Math.cos(near.lat * Math.PI / 180));
  const viewbox = [near.lng - dLng, near.lat + dLat, near.lng + dLng, near.lat - dLat].join(",");
  const out = [];
  for (const type of types) {
    for (const term of NOMINATIM_TERMS[type]) {
      const params = new URLSearchParams({ q: term, format: "jsonv2", addressdetails: "1", limit: "10", bounded: "1", viewbox, countrycodes: geo.countryCodes });
      const results = await throttled(() => getJson(`${geo.geocoderUrl}/search?${params}`));
      for (const r of results) {
        const lat = Number(r.lat), lng = Number(r.lon);
        out.push({
          id: `osm:${r.osm_type}/${r.osm_id}`, name: shortName(r) || r.display_name, type,
          kind: r.type, address: r.display_name, lat: round(lat), lng: round(lng),
          openingHours: null, phone: null,
          distanceKm: Math.round(haversine(near.lat, near.lng, lat, lng) * 10) / 10,
        });
      }
    }
  }
  const seen = new Set();
  return out.filter(p => !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, config.safePlaces.maxResults);
};

exports.safePlaces = async (near, type) => {  const sp = config.safePlaces;
  const types = type && SAFE_TAGS[type] ? [type] : Object.keys(SAFE_TAGS);
  const r = sp.radiusMeters;
  const parts = types.flatMap(t => SAFE_TAGS[t]).map(tag => `nwr${tag}(around:${r},${near.lat},${near.lng});`).join("");
  const query = `[out:json][timeout:15];(${parts});out center 120;`;
  const key = `sp:${types.join(",")}:${round(near.lat, 3)}:${round(near.lng, 3)}`;
  return cached(key, async () => {
    let data = null, lastError = "could not be reached";
    for (const url of sp.overpassUrls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": geo.userAgent, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) { lastError = `returned an error (${res.status})`; continue; }
        data = await res.json();
        break;
      } catch (e) {
        lastError = "could not be reached";
      }
    }
    if (!data) {
      // Overpass busy → same OpenStreetMap data through Nominatim, bounded to the area
      const fallback = await safePlacesViaNominatim(near, types, r).catch(() => null);
      if (fallback) return fallback;
      throw new GeoError(`The safe-places service ${lastError}. Try again, or search for a place by name.`, 503);
    }
    const seen = new Set();
    return (data.elements || [])
      .map(e => {
        const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
        const t = e.tags || {};
        if (lat == null || !t.name) return null;      // unnamed places are hard to find in a hurry
        const a = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] || t["addr:city"]].filter(Boolean).join(", ");
        return {
          id: `osm:${e.type}/${e.id}`, name: t["name:en"] || t.name, type: typeOf(t),
          kind: t.amenity || t.shop, address: a, lat: round(lat), lng: round(lng),
          openingHours: t.opening_hours || null, phone: t.phone || t["contact:phone"] || null,
          distanceKm: Math.round(haversine(near.lat, near.lng, lat, lng) * 10) / 10,
        };
      })
      .filter(p => p && !seen.has(p.name + p.type) && seen.add(p.name + p.type))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, sp.maxResults);
  });
};

exports.GeoError = GeoError;
