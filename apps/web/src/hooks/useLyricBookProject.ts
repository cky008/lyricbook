import { loadPreset, loadPresetIndex } from "@app/lib/presets";
import {
  backupProject,
  loadStoredProject,
  replaceStoredProject,
  saveStoredProject,
} from "@app/lib/storage";
import {
  createBlankProject,
  type LyricBookProject,
  migrateLegacyThemes,
  parseProject,
  touchProject,
  type UiLocale,
} from "@domain/index";
import { useCallback, useEffect, useRef, useState } from "react";

interface ProjectState {
  project: LyricBookProject | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

function hasPersistedThemeMigration(stored: LyricBookProject, parsed: LyricBookProject): boolean {
  return (
    stored.activeThemeId !== parsed.activeThemeId ||
    stored.themes.length !== parsed.themes.length ||
    stored.themes.some((theme, index) => theme.id !== parsed.themes[index]?.id)
  );
}

export function useLyricBookProject(locale: UiLocale) {
  const [state, setState] = useState<ProjectState>({
    project: null,
    loading: true,
    saving: false,
    error: null,
  });
  const saveTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);
  const replacementInProgress = useRef(false);
  const mounted = useRef(true);
  const initialized = useRef(false);

  const enqueueWrite = useCallback((write: () => Promise<void>) => {
    const pending = saveQueue.current.then(write);
    // A failed write must not prevent the next edit or import from being persisted.
    saveQueue.current = pending.catch(() => undefined);
    return pending;
  }, []);

  const scheduleSave = useCallback(
    (next: LyricBookProject, revision: number) => {
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        saveTimer.current = undefined;
        try {
          await enqueueWrite(async () => {
            if (revision !== saveRevision.current || !mounted.current) return;
            await saveStoredProject(next);
          });
          if (revision !== saveRevision.current || !mounted.current) return;
          setState((value) => ({ ...value, saving: false, error: null }));
        } catch (error) {
          if (revision !== saveRevision.current || !mounted.current) return;
          setState((value) => ({
            ...value,
            saving: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }, 300);
    },
    [enqueueWrite],
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function initialize() {
      try {
        const stored = await loadStoredProject();
        if (cancelled) return;
        if (stored) {
          const parsed = parseProject(stored, { migrateLegacyThemeData: false });
          const project = migrateLegacyThemes(parsed);
          let visibleProject = project;
          let migrationError: string | null = null;
          if (hasPersistedThemeMigration(parsed, project)) {
            try {
              await replaceStoredProject(
                stored,
                project,
                "Migrate published themes to the built-in collection",
              );
            } catch (error) {
              visibleProject = parsed;
              migrationError = error instanceof Error ? error.message : String(error);
            }
          }
          if (cancelled) return;
          setState({
            project: visibleProject,
            loading: false,
            saving: false,
            error: migrationError,
          });
          initialized.current = true;
          return;
        }
        const presets = await loadPresetIndex();
        const first = presets[0];
        const project = first ? await loadPreset(first) : createBlankProject(locale);
        if (cancelled) return;
        await saveStoredProject(project);
        setState({ project, loading: false, saving: false, error: null });
        initialized.current = true;
      } catch (error) {
        if (cancelled) return;
        const project = createBlankProject(locale);
        setState({
          project,
          loading: false,
          saving: false,
          error: error instanceof Error ? error.message : String(error),
        });
        initialized.current = true;
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      mounted.current = false;
      saveRevision.current += 1;
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    };
  }, [locale]);

  const updateProject = useCallback(
    (updater: (current: LyricBookProject) => LyricBookProject) => {
      // The import dialog stays modal while replacement is in progress. Ignore stale
      // callbacks from the previous project until its successor has been published.
      if (replacementInProgress.current) return;
      setState((currentState) => {
        if (!currentState.project) return currentState;
        const next = touchProject(updater(structuredClone(currentState.project)));
        saveRevision.current += 1;
        scheduleSave(next, saveRevision.current);
        return { ...currentState, project: next, saving: true, error: null };
      });
    },
    [scheduleSave],
  );

  const replaceProject = useCallback(
    async (next: LyricBookProject, reason: string) => {
      if (replacementInProgress.current) {
        throw new Error("A project replacement is already in progress");
      }
      replacementInProgress.current = true;
      const current = state.project;
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      const revision = ++saveRevision.current;
      setState((value) => ({ ...value, saving: true, error: null }));
      try {
        await enqueueWrite(async () => {
          if (current) await replaceStoredProject(current, next, reason);
          else await saveStoredProject(next);
        });
        if (revision !== saveRevision.current || !mounted.current) return;
        setState({ project: next, loading: false, saving: false, error: null });
      } catch (error) {
        if (revision === saveRevision.current && mounted.current) {
          // The cancelled debounce may contain edits that are not stored yet.
          if (current) scheduleSave(current, revision);
          setState((value) => ({
            ...value,
            saving: Boolean(current),
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        throw error;
      } finally {
        replacementInProgress.current = false;
      }
    },
    [enqueueWrite, scheduleSave, state.project],
  );

  const createBackup = useCallback(
    async (reason: string) => {
      if (!state.project) return undefined;
      return await backupProject(state.project, reason);
    },
    [state.project],
  );

  return {
    ...state,
    updateProject,
    replaceProject,
    createBackup,
    initialized: initialized.current,
  };
}
