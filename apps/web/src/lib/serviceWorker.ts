export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    const url = new URL("sw.js", document.baseURI);
    navigator.serviceWorker
      .register(url, { scope: new URL("./", document.baseURI).pathname })
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });
  });
}
