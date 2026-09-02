import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServiceWorkerRegistration } from "../../apps/web/src/lib/serviceWorker";

type Listener = (event: Event) => void;

class ListenerTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener = (type: string, listener: Listener): void => {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  };

  removeEventListener = (type: string, listener: Listener): void => {
    this.listeners.get(type)?.delete(listener);
  };

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createHarness({
  controlled = true,
  registerFailures = 0,
  readyState = "complete" as DocumentReadyState,
}: {
  controlled?: boolean;
  registerFailures?: number;
  readyState?: DocumentReadyState;
} = {}) {
  const windowEvents = new ListenerTarget();
  const documentEvents = new ListenerTarget();
  const workerEvents = new ListenerTarget();
  const registration = { update: vi.fn(async () => registration) };
  let remainingRegisterFailures = registerFailures;
  const register = vi.fn(async () => {
    if (remainingRegisterFailures > 0) {
      remainingRegisterFailures -= 1;
      throw new Error("temporary registration failure");
    }
    return registration;
  });
  const reload = vi.fn();
  const warn = vi.fn();
  let controller: object | null = controlled ? {} : null;
  let visibilityState: DocumentVisibilityState = "visible";

  const environment = {
    window: {
      addEventListener: windowEvents.addEventListener,
      removeEventListener: windowEvents.removeEventListener,
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    },
    document: {
      baseURI: "https://example.test/lyricbook/",
      get readyState() {
        return readyState;
      },
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: documentEvents.addEventListener,
      removeEventListener: documentEvents.removeEventListener,
    },
    serviceWorker: {
      get controller() {
        return controller;
      },
      register,
      addEventListener: workerEvents.addEventListener,
      removeEventListener: workerEvents.removeEventListener,
    },
    reload,
    warn,
  };

  return {
    documentEvents,
    environment,
    register,
    registration,
    reload,
    setController(value: object | null) {
      controller = value;
    },
    setVisibility(value: DocumentVisibilityState) {
      visibilityState = value;
    },
    warn,
    windowEvents,
    workerEvents,
  };
}

async function flushRegistration(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("service worker registration updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bypasses the HTTP cache and explicitly checks for an update", async () => {
    const harness = createHarness();
    const cleanup = setupServiceWorkerRegistration(harness.environment);

    await flushRegistration();

    expect(harness.register).toHaveBeenCalledWith("https://example.test/lyricbook/sw.js", {
      scope: "/lyricbook/",
      updateViaCache: "none",
    });
    expect(harness.registration.update).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("checks again when a page is restored or becomes visible", async () => {
    const harness = createHarness();
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    harness.windowEvents.dispatch("pageshow");
    await vi.runAllTimersAsync();
    expect(harness.registration.update).toHaveBeenCalledTimes(2);

    harness.setVisibility("hidden");
    harness.documentEvents.dispatch("visibilitychange");
    await vi.runAllTimersAsync();
    expect(harness.registration.update).toHaveBeenCalledTimes(2);

    harness.setVisibility("visible");
    harness.documentEvents.dispatch("visibilitychange");
    await vi.runAllTimersAsync();
    expect(harness.registration.update).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it("never reloads an editing page when its controller changes", async () => {
    const harness = createHarness({ controlled: true });
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    harness.workerEvents.dispatch("controllerchange");
    harness.workerEvents.dispatch("controllerchange");

    expect(harness.reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not reload when the first service worker takes control", async () => {
    const harness = createHarness({ controlled: false });
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    harness.setController({});
    harness.workerEvents.dispatch("controllerchange");

    expect(harness.reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("retries a failed registration when a restored page is shown", async () => {
    const harness = createHarness({ registerFailures: 1 });
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    expect(harness.register).toHaveBeenCalledTimes(1);
    expect(harness.registration.update).not.toHaveBeenCalled();
    expect(harness.warn).toHaveBeenCalledTimes(1);

    harness.windowEvents.dispatch("pageshow");
    await vi.runAllTimersAsync();
    await flushRegistration();

    expect(harness.register).toHaveBeenCalledTimes(2);
    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not lose a pageshow retry while registration is still failing", async () => {
    const harness = createHarness({ registerFailures: 1 });
    const cleanup = setupServiceWorkerRegistration(harness.environment);

    harness.windowEvents.dispatch("pageshow");
    await flushRegistration();
    await flushRegistration();

    expect(harness.register).toHaveBeenCalledTimes(2);
    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("retries a failed registration when the page becomes visible", async () => {
    const harness = createHarness({ registerFailures: 1 });
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    harness.setVisibility("hidden");
    harness.documentEvents.dispatch("visibilitychange");
    await vi.runAllTimersAsync();
    expect(harness.register).toHaveBeenCalledTimes(1);

    harness.setVisibility("visible");
    harness.documentEvents.dispatch("visibilitychange");
    await vi.runAllTimersAsync();
    await flushRegistration();

    expect(harness.register).toHaveBeenCalledTimes(2);
    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("removes listeners and cancels scheduled updates during cleanup", async () => {
    const harness = createHarness();
    const cleanup = setupServiceWorkerRegistration(harness.environment);
    await flushRegistration();

    harness.windowEvents.dispatch("pageshow");
    cleanup();
    await vi.runAllTimersAsync();

    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    expect(harness.windowEvents.listenerCount("pageshow")).toBe(0);
    expect(harness.documentEvents.listenerCount("visibilitychange")).toBe(0);
    expect(harness.workerEvents.listenerCount("controllerchange")).toBe(0);

    harness.workerEvents.dispatch("controllerchange");
    expect(harness.reload).not.toHaveBeenCalled();
  });

  it("can be disposed before window load without registering", async () => {
    const harness = createHarness({ readyState: "loading" });
    const cleanup = setupServiceWorkerRegistration(harness.environment);

    expect(harness.windowEvents.listenerCount("load")).toBe(1);
    cleanup();
    harness.windowEvents.dispatch("load");
    await flushRegistration();

    expect(harness.windowEvents.listenerCount("load")).toBe(0);
    expect(harness.register).not.toHaveBeenCalled();
  });
});
