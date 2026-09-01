let lockCount = 0;
let savedY = 0;

export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    savedY = window.scrollY;
    document.documentElement.dataset.scrollLocked = "true";
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      delete document.documentElement.dataset.scrollLocked;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo({ top: savedY, behavior: "auto" });
    }
  };
}

export function forceReleaseScrollLocks(): void {
  lockCount = 0;
  delete document.documentElement.dataset.scrollLocked;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
}
