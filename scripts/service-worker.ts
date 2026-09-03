interface ServiceWorkerSourceOptions {
  cacheId: string;
  cachePrefix: string;
  precache: string[];
}

/** Build the small, dependency-free worker shipped with the static application. */
export function buildServiceWorkerSource({
  cacheId,
  cachePrefix,
  precache,
}: ServiceWorkerSourceOptions): string {
  return `const CACHE_ID = ${JSON.stringify(cacheId)};
const CACHE_FAMILY_PREFIX = ${JSON.stringify(cachePrefix)};
const SCOPED_CACHE_ROOT = CACHE_FAMILY_PREFIX + "scope-";
const SCOPE_TOKEN = encodeURIComponent(new URL(self.registration.scope).pathname);
const CACHE_PREFIX = SCOPED_CACHE_ROOT + SCOPE_TOKEN + "-";
const CACHE_NAME = CACHE_PREFIX + CACHE_ID;
	const LEGACY_VERSION_PREFIX = "lyricbook-v";
	const SCOPE_INDEX_URL = new URL("index.html", self.registration.scope).href;
	const LOCALE_ROOT_URL = new URL("locales/", self.registration.scope).href;
	const COMPLETION_MARKER_URL = new URL("__lyricbook-cache-complete__", self.registration.scope).href;
const PRECACHE = ${JSON.stringify(precache, null, 2)};

function isLegacyCacheName(name) {
  return name.startsWith(LEGACY_VERSION_PREFIX) ||
    (name.startsWith(CACHE_FAMILY_PREFIX) && !name.startsWith(SCOPED_CACHE_ROOT));
}

async function completionTime(cacheName) {
  try {
    const marker = await (await caches.open(cacheName)).match(COMPLETION_MARKER_URL);
    if (!marker) return undefined;
    const metadata = await marker.json();
    if (metadata.cacheName !== cacheName || !Number.isFinite(metadata.completedAt)) return undefined;
    return metadata.completedAt;
  } catch {
    return undefined;
  }
}

async function legacyCacheMatchesScope(cacheName) {
  try {
    return Boolean(
      await (await caches.open(cacheName)).match(SCOPE_INDEX_URL, { ignoreVary: true }),
    );
  } catch {
    return false;
  }
}

async function fallbackCandidates() {
  const keys = await caches.keys();
  const candidates = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === CACHE_NAME) continue;
    if (key.startsWith(CACHE_PREFIX)) {
      const completedAt = await completionTime(key);
      if (completedAt !== undefined) candidates.push({ key, completedAt, index });
    } else if (isLegacyCacheName(key) && await legacyCacheMatchesScope(key)) {
      // Legacy workers had no marker. A cached scoped index proves addAll completed;
      // score it below every marker-aware build so it survives one transition only.
      candidates.push({ key, completedAt: 0, index });
    }
  }
  candidates.sort((left, right) =>
    right.completedAt - left.completedAt || right.index - left.index
  );
  return candidates;
}

async function matchAcrossCaches(request, ignoreSearch = false) {
	const fallbacks = await fallbackCandidates();
	const ordered = [CACHE_NAME, ...fallbacks.map(({ key }) => key)];
	for (const key of ordered) {
		const cached = await (await caches.open(key)).match(request, { ignoreVary: true, ignoreSearch });
		if (cached) return cached;
	}
	return undefined;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) return response;
  } catch {
    // The current and immediately previous builds remain available offline.
  }
  return (await matchAcrossCaches(SCOPE_INDEX_URL)) || Response.error();
}

async function cacheFirst(request) {
	const cached = await matchAcrossCaches(request);
	if (cached) return cached;
	return fetch(request);
}

async function networkFirstLocale(request) {
	try {
		const response = await fetch(request, { cache: "no-store" });
		if (response.ok) return response;
	} catch {
		// A precached catalog without the build query remains available offline.
	}
	return (await matchAcrossCaches(request, true)) || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const existingMarker = await cache.match(COMPLETION_MARKER_URL).catch(() => undefined);
    try {
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await cache.put(COMPLETION_MARKER_URL, new Response(JSON.stringify({
        cacheName: CACHE_NAME,
        completedAt: Date.now(),
      }), { headers: { "Content-Type": "application/json" } }));
      await self.skipWaiting();
    } catch (error) {
      if (!existingMarker) await caches.delete(CACHE_NAME).catch(() => false);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const [predecessor] = await fallbackCandidates();
    const keys = await caches.keys();
    for (const key of keys) {
      if (key === CACHE_NAME || key === predecessor?.key) continue;
      if (key.startsWith(CACHE_PREFIX)) {
        await caches.delete(key);
      } else if (isLegacyCacheName(key) && await legacyCacheMatchesScope(key)) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.href === new URL("version.json", self.registration.scope).href) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => matchAcrossCaches(event.request)));
    return;
  }
	if (event.request.mode === "navigate") {
		event.respondWith(networkFirstNavigation(event.request));
		return;
	}
	if (url.href.startsWith(LOCALE_ROOT_URL)) {
		event.respondWith(networkFirstLocale(event.request));
		return;
	}
	event.respondWith(cacheFirst(event.request));
});
`;
}
