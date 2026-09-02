type Listener = (event: Event) => void;

interface LifecycleEventTarget {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
}

interface UpdateableRegistration {
  update(): Promise<unknown>;
}

interface ServiceWorkerTarget {
  register(
    scriptUrl: string,
    options: { scope: string; updateViaCache: "none" },
  ): Promise<UpdateableRegistration>;
}

export interface ServiceWorkerRegistrationEnvironment {
  window: LifecycleEventTarget & {
    setTimeout(handler: () => void, timeout: number): number;
    clearTimeout(handle: number): void;
  };
  document: LifecycleEventTarget & {
    readonly baseURI: string;
    readonly readyState: DocumentReadyState;
    readonly visibilityState: DocumentVisibilityState;
  };
  serviceWorker: ServiceWorkerTarget;
  warn(message: string, error: unknown): void;
}

/**
 * Installs the update lifecycle independently from the production environment
 * gate so its event and timer behavior can be exercised without a real worker.
 */
export function setupServiceWorkerRegistration(
  environment: ServiceWorkerRegistrationEnvironment,
): () => void {
  const { window: windowTarget, document: documentTarget, serviceWorker, warn } = environment;
  let disposed = false;
  let registering = false;
  let registrationRetryQueued = false;
  let updateTimer: number | undefined;
  let updateInFlight = false;
  let updateQueued = false;
  let registration: UpdateableRegistration | undefined;

  const scheduleUpdate = () => {
    if (disposed || !registration || updateTimer !== undefined) return;
    updateTimer = windowTarget.setTimeout(() => {
      updateTimer = undefined;
      void checkForUpdate();
    }, 0);
  };

  const checkForUpdate = async (): Promise<void> => {
    if (disposed || !registration) return;
    if (updateInFlight) {
      updateQueued = true;
      return;
    }

    updateInFlight = true;
    try {
      await registration.update();
    } catch (error) {
      if (!disposed) warn("Service worker update check failed", error);
    } finally {
      updateInFlight = false;
      if (!disposed && updateQueued) {
        updateQueued = false;
        scheduleUpdate();
      }
    }
  };

  const start = async (): Promise<void> => {
    if (disposed || registering || registration) return;
    registering = true;
    try {
      const nextRegistration = await serviceWorker.register(
        new URL("sw.js", documentTarget.baseURI).href,
        {
          scope: new URL("./", documentTarget.baseURI).pathname,
          updateViaCache: "none",
        },
      );
      if (disposed) return;
      registration = nextRegistration;
      await checkForUpdate();
    } catch (error) {
      if (!disposed) warn("Service worker registration failed", error);
    } finally {
      registering = false;
      if (!disposed && !registration && registrationRetryQueued) {
        registrationRetryQueued = false;
        void start();
      }
    }
  };

  const requestUpdate = () => {
    if (disposed) return;
    if (registration) scheduleUpdate();
    else if (registering) registrationRetryQueued = true;
    else void start();
  };

  const onLoad: Listener = () => {
    windowTarget.removeEventListener("load", onLoad);
    void start();
  };
  const onPageShow: Listener = () => requestUpdate();
  const onVisibilityChange: Listener = () => {
    if (documentTarget.visibilityState === "visible") requestUpdate();
  };

  windowTarget.addEventListener("pageshow", onPageShow);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  if (documentTarget.readyState === "complete") void start();
  else windowTarget.addEventListener("load", onLoad);

  return () => {
    if (disposed) return;
    disposed = true;
    windowTarget.removeEventListener("load", onLoad);
    windowTarget.removeEventListener("pageshow", onPageShow);
    documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    if (updateTimer !== undefined) {
      windowTarget.clearTimeout(updateTimer);
      updateTimer = undefined;
    }
  };
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  setupServiceWorkerRegistration({
    window,
    document,
    serviceWorker: navigator.serviceWorker,
    warn: (message, error) => console.warn(message, error),
  });
}
