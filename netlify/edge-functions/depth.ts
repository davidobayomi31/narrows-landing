// Bathymetry tile proxy for the Narrows app.
//
// Simcoe County publishes a free water-depth (bathymetry) tile cache, but its
// Esri "native" scheme numbers zoom levels offset by 9 from the standard slippy
// map scheme that react-native-maps' UrlTile uses (native level = standardZoom - 9),
// and its GoogleMapsCompatible matrix set is empty. UrlTile can't do that math in
// its URL template, so this function translates a standard /depth/{z}/{x}/{y}
// request into Simcoe's /tile/{z-9}/{y}/{x} and returns the image.
//
// Netlify's CDN caches each tile (long max-age below), so we effectively mirror
// the county's tiles instead of hitting their server on every pan.
//
// Data © Corporation of the County of Simcoe, licensed under the
// Open Government Licence – Simcoe County. For reference only, not for navigation.

const UPSTREAM =
  'https://maps.simcoe.ca/arcgis/rest/services/Public/Bathymetry_Cache/MapServer/tile';

// Simcoe's cache only holds native levels 0–11 (= standard zoom 9–20).
const MIN_STD_ZOOM = 9;
const MAX_STD_ZOOM = 20;

// 1×1 fully-transparent PNG, returned for zoom levels the cache doesn't cover so
// the map just shows the base tiles there.
const TRANSPARENT_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

function transparent(): Response {
  return new Response(TRANSPARENT_PNG, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=2592000',
      'access-control-allow-origin': '*',
    },
  });
}

export default async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);
  // /depth/{z}/{x}/{y}  (optional .png suffix)
  const m = pathname.match(/\/depth\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) return new Response('Not found', { status: 404 });

  const z = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);

  if (z < MIN_STD_ZOOM || z > MAX_STD_ZOOM) return transparent();

  const level = z - 9; // native cache level
  // native tile path is /tile/{level}/{row}/{col} = /tile/{level}/{y}/{x}
  const upstreamUrl = `${UPSTREAM}/${level}/${y}/${x}`;

  const resp = await fetch(upstreamUrl);
  if (!resp.ok) return transparent();

  const body = await resp.arrayBuffer();
  return new Response(body, {
    headers: {
      'content-type': resp.headers.get('content-type') ?? 'image/png',
      // 30-day CDN cache → this endpoint becomes our mirror of the county tiles
      'cache-control': 'public, max-age=2592000, s-maxage=2592000',
      'access-control-allow-origin': '*',
    },
  });
};

export const config = { path: '/depth/*' };
