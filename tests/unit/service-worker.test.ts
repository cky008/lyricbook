import { describe, expect, it, vi } from "vitest";
import { buildServiceWorkerSource } from "../../scripts/service-worker";

interface WorkerRequestInit {
  cache?: string;
  method?: string;
  mode?: string;
}

interface WorkerRequestLike {
  readonly cache: string;
  readonly method: string;
  readonly mode: string;
  readonly url: string;
}

interface WorkerCacheQueryOptions {
  ignoreSearch?: boolean;
}

type RequestInput = string | WorkerRequestLike;
type FetchBehavior = (request: WorkerRequestLike) => Promise<Response>;

class MemoryCache {
  readonly entries = new Map<string, Response>();
  failNextAddAll = false;

  constructor(private readonly fetchBehavior: () => FetchBehavior) {}

  async addAll(requests: WorkerRequestLike[]): Promise<void> {
    if (this.failNextAddAll) {
      this.failNextAddAll = false;
      throw new TypeError("precache failed");
    }
    const pending: Array<[string, Response]> = [];
    for (const request of requests) {
      const response = await this.fetchBehavior()(request);
      if (!response.ok) throw new TypeError(`precache failed for ${request.url}`);
      pending.push([request.url, response.clone()]);
    }
    for (const [url, response] of pending) this.entries.set(url, response);
  }

  async match(
    request: RequestInput,
    options: WorkerCacheQueryOptions = {},
  ): Promise<Response | undefined> {
    const requestUrl = typeof request === "string" ? request : request.url;
    const key = options.ignoreSearch
      ? [...this.entries.keys()].find((candidate) => {
          const cached = new URL(candidate);
          const requested = new URL(requestUrl);
          return cached.origin === requested.origin && cached.pathname === requested.pathname;
        })
      : requestUrl;
    const response = key ? this.entries.get(key) : undefined;
    return response?.clone();
  }

  async put(request: RequestInput, response: Response): Promise<void> {
    this.entries.set(typeof request === "string" ? request : request.url, response.clone());
  }
}

class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>();
  failAddAllForNextCache = false;
  fetchBehavior: FetchBehavior = async (request) =>
    new Response(`network:${new URL(request.url).pathname}`, {
      headers: { "Content-Type": "text/plain" },
    });

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async open(name: string): Promise<MemoryCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new MemoryCache(() => this.fetchBehavior);
      cache.failNextAddAll = this.failAddAllForNextCache;
      this.failAddAllForNextCache = false;
      this.caches.set(name, cache);
    }
    return cache;
  }

  async seed(name: string, url: string, body: string): Promise<void> {
    await (await this.open(name)).put(url, new Response(body));
  }
}

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike {
  request: WorkerRequestLike;
  respondWith(response: Promise<Response> | Response): void;
}

type WorkerEventListener = (event: ExtendableEventLike & Partial<FetchEventLike>) => void;

function workerSource(cacheId: string): string {
  return buildServiceWorkerSource({
    cacheId,
    cachePrefix: "lyricbook-build-",
    precache: ["./index.html", `./assets/${cacheId}.js`, "./locales/en-US/main.ftl"],
  });
}

function createWorkerHarness(
  source: string,
  scope: string,
  cacheStorage = new MemoryCacheStorage(),
) {
  const scriptUrl = new URL("sw.js", scope);
  const listeners = new Map<string, WorkerEventListener>();
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);

  class WorkerRequest implements WorkerRequestLike {
    readonly cache: string;
    readonly method: string;
    readonly mode: string;
    readonly url: string;

    constructor(input: RequestInput, init: WorkerRequestInit = {}) {
      const previous = typeof input === "string" ? undefined : input;
      this.url = new URL(typeof input === "string" ? input : input.url, scriptUrl).href;
      this.cache = init.cache ?? previous?.cache ?? "default";
      this.method = init.method ?? previous?.method ?? "GET";
      this.mode = init.mode ?? previous?.mode ?? "cors";
    }
  }

  const workerFetch = vi.fn(
    async (input: RequestInput, init: WorkerRequestInit = {}): Promise<Response> =>
      cacheStorage.fetchBehavior(new WorkerRequest(input, init)),
  );
  const workerSelf = {
    addEventListener(type: string, listener: WorkerEventListener) {
      listeners.set(type, listener);
    },
    clients: { claim },
    location: scriptUrl,
    registration: { scope },
    skipWaiting,
  };

  new Function("self", "caches", "fetch", "Request", "Response", "URL", source)(
    workerSelf,
    cacheStorage,
    workerFetch,
    WorkerRequest,
    Response,
    URL,
  );

  return {
    cacheStorage,
    claim,
    async dispatch(type: "activate" | "install"): Promise<void> {
      let lifetime: Promise<unknown> | undefined;
      listeners.get(type)?.({
        waitUntil(promise) {
          lifetime = Promise.resolve(promise);
        },
      });
      if (!lifetime) throw new Error(`Missing ${type} waitUntil promise`);
      await lifetime;
    },
    async fetch(url: string, mode = "cors"): Promise<Response> {
      let responsePromise: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request: new WorkerRequest(url, { mode }),
        respondWith(response) {
          responsePromise = Promise.resolve(response);
        },
        waitUntil() {},
      });
      if (!responsePromise) throw new Error("Worker did not handle request");
      return await responsePromise;
    },
    skipWaiting,
    workerFetch,
  };
}

function cacheNameFor(cacheStorage: MemoryCacheStorage, cacheId: string): string {
  const name = [...cacheStorage.caches.keys()].find((key) => key.endsWith(cacheId));
  if (!name) throw new Error(`Missing cache for ${cacheId}`);
  return name;
}

describe("service worker update safety", () => {
  it("keeps network navigation out of the immutable build cache", async () => {
    const scope = "https://example.test/lyricbook/";
    const harness = createWorkerHarness(workerSource("build-a"), scope);
    harness.cacheStorage.fetchBehavior = async (request) =>
      new Response(request.url.endsWith("index.html") ? "A shell" : "A asset");
    await harness.dispatch("install");
    await harness.dispatch("activate");

    harness.cacheStorage.fetchBehavior = async () => new Response("B shell");
    expect(await (await harness.fetch(scope, "navigate")).text()).toBe("B shell");

    const cacheName = cacheNameFor(harness.cacheStorage, "build-a");
    const cache = await harness.cacheStorage.open(cacheName);
    expect(cache.entries.has(scope)).toBe(false);
    expect(await (await cache.match(`${scope}index.html`))?.text()).toBe("A shell");

    harness.cacheStorage.fetchBehavior = async () => {
      throw new TypeError("offline");
    };
    expect(await (await harness.fetch(scope, "navigate")).text()).toBe("A shell");
  });

  it("loads fingerprinted locale catalogs from the network before using cached fallbacks", async () => {
    const scope = "https://example.test/lyricbook/";
    const harness = createWorkerHarness(workerSource("build-a"), scope);
    harness.cacheStorage.fetchBehavior = async (request) =>
      new Response(request.url.includes("main.ftl") ? "old catalog" : "build asset");
    await harness.dispatch("install");
    await harness.dispatch("activate");

    harness.cacheStorage.fetchBehavior = async (request) =>
      new Response(request.url.includes("main.ftl") ? "new catalog" : "network asset");
    const localeUrl = `${scope}locales/en-US/main.ftl?v=next-build`;
    expect(await (await harness.fetch(localeUrl)).text()).toBe("new catalog");
    expect(harness.workerFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: localeUrl }),
      { cache: "no-store" },
    );

    harness.cacheStorage.fetchBehavior = async () => {
      throw new TypeError("offline");
    };
    expect(await (await harness.fetch(localeUrl)).text()).toBe("old catalog");
  });

  it("deletes a newly created cache when precaching fails", async () => {
    const cacheStorage = new MemoryCacheStorage();
    cacheStorage.failAddAllForNextCache = true;
    const harness = createWorkerHarness(
      workerSource("failed-build"),
      "https://example.test/lyricbook/",
      cacheStorage,
    );

    await expect(harness.dispatch("install")).rejects.toThrow("precache failed");
    expect(await cacheStorage.keys()).toEqual([]);
    expect(harness.skipWaiting).not.toHaveBeenCalled();
  });

  it("retains the latest completed predecessor instead of a newer empty cache", async () => {
    const scope = "https://example.test/lyricbook/";
    const cacheStorage = new MemoryCacheStorage();
    const first = createWorkerHarness(workerSource("build-a"), scope, cacheStorage);
    await first.dispatch("install");
    await first.dispatch("activate");
    const firstName = cacheNameFor(cacheStorage, "build-a");

    await cacheStorage.open(`${firstName.slice(0, -"build-a".length)}failed-build-b`);
    const third = createWorkerHarness(workerSource("build-c"), scope, cacheStorage);
    await third.dispatch("install");
    await third.dispatch("activate");

    const names = await cacheStorage.keys();
    expect(names).toContain(firstName);
    expect(names).toContain(cacheNameFor(cacheStorage, "build-c"));
    expect(names.some((name) => name.endsWith("failed-build-b"))).toBe(false);
    expect(names).toHaveLength(2);
  });

  it("orders completed predecessors by their marker rather than cache creation", async () => {
    const scope = "https://example.test/lyricbook/";
    const cacheStorage = new MemoryCacheStorage();
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(200);
      await createWorkerHarness(workerSource("completed-later"), scope, cacheStorage).dispatch(
        "install",
      );
      const expectedPredecessor = cacheNameFor(cacheStorage, "completed-later");

      now.mockReturnValue(100);
      await createWorkerHarness(workerSource("created-later"), scope, cacheStorage).dispatch(
        "install",
      );

      now.mockReturnValue(300);
      const current = createWorkerHarness(workerSource("current"), scope, cacheStorage);
      await current.dispatch("install");
      await current.dispatch("activate");

      const names = await cacheStorage.keys();
      expect(names).toContain(expectedPredecessor);
      expect(names.some((name) => name.endsWith("created-later"))).toBe(false);
      expect(names).toHaveLength(2);
    } finally {
      now.mockRestore();
    }
  });

  it("isolates cache cleanup between service-worker scopes", async () => {
    const cacheStorage = new MemoryCacheStorage();
    const source = workerSource("same-build");
    const first = createWorkerHarness(source, "https://example.test/one/", cacheStorage);
    const second = createWorkerHarness(source, "https://example.test/two/", cacheStorage);

    await first.dispatch("install");
    await first.dispatch("activate");
    await second.dispatch("install");
    await second.dispatch("activate");

    const names = await cacheStorage.keys();
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.some((name) => name.includes(encodeURIComponent("/one/")))).toBe(true);
    expect(names.some((name) => name.includes(encodeURIComponent("/two/")))).toBe(true);
  });

  it("uses one matching legacy cache for the first transition and removes it after the next", async () => {
    const scope = "https://example.test/lyricbook/";
    const cacheStorage = new MemoryCacheStorage();
    await cacheStorage.seed("lyricbook-v0.0.6", `${scope}index.html`, "legacy six");
    await cacheStorage.seed("lyricbook-v0.0.7", `${scope}index.html`, "legacy seven");
    await cacheStorage.seed("lyricbook-v0.0.7", `${scope}assets/legacy.js`, "legacy asset");

    const first = createWorkerHarness(workerSource("build-a"), scope, cacheStorage);
    await first.dispatch("install");
    await first.dispatch("activate");
    expect(await cacheStorage.keys()).toContain("lyricbook-v0.0.7");
    expect(await cacheStorage.keys()).not.toContain("lyricbook-v0.0.6");

    cacheStorage.fetchBehavior = async () => {
      throw new TypeError("offline");
    };
    expect(await (await first.fetch(`${scope}assets/legacy.js`)).text()).toBe("legacy asset");

    cacheStorage.fetchBehavior = async (request) => new Response(`next:${request.url}`);
    const second = createWorkerHarness(workerSource("build-b"), scope, cacheStorage);
    await second.dispatch("install");
    await second.dispatch("activate");
    const names = await cacheStorage.keys();
    expect(names).not.toContain("lyricbook-v0.0.7");
    expect(names).toContain(cacheNameFor(cacheStorage, "build-a"));
    expect(names).toContain(cacheNameFor(cacheStorage, "build-b"));
  });

  it("never substitutes index HTML for a missing static asset", async () => {
    const scope = "https://example.test/lyricbook/";
    const harness = createWorkerHarness(workerSource("build-a"), scope);
    await harness.dispatch("install");
    await harness.dispatch("activate");
    harness.cacheStorage.fetchBehavior = async () => {
      throw new TypeError("offline");
    };

    await expect(harness.fetch(`${scope}assets/missing.js`)).rejects.toThrow("offline");
  });
});
