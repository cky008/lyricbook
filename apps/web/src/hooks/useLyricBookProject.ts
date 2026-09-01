import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBlankProject,
  parseProject,
  touchProject,
  type LyricBookProject,
  type UiLocale,
} from "@domain/index";
import { loadPreset, loadPresetIndex } from "@app/lib/presets";
import {
  backupProject,
  loadStoredProject,
  replaceStoredProject,
  saveStoredProject,
} from "@app/lib/storage";

interface ProjectState {
  project: LyricBookProject | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export function useLyricBookProject(locale: UiLocale) {
  const [state, setState] = useState<ProjectState>({
    project: null,
    loading: true,
    saving: false,
    error: null,
  });
  const saveTimer = useRef<number | undefined>(undefined);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const stored = await loadStoredProject();
        if (cancelled) return;
        if (stored) {
          setState({ project: parseProject(stored), loading: false, saving: false, error: null });
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
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [locale]);

  const updateProject = useCallback((updater: (current: LyricBookProject) => LyricBookProject) => {
    setState((currentState) => {
      if (!currentState.project) return currentState;
      const next = touchProject(updater(structuredClone(currentState.project)));
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        setState((value) => ({ ...value, saving: true }));
        try {
          await saveStoredProject(next);
          setState((value) => ({ ...value, saving: false, error: null }));
        } catch (error) {
          setState((value) => ({
            ...value,
            saving: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }, 300);
      return { ...currentState, project: next, saving: true, error: null };
    });
  }, []);

  const replaceProject = useCallback(
    async (next: LyricBookProject, reason: string) => {
      const current = state.project;
      if (current) await replaceStoredProject(current, next, reason);
      else await saveStoredProject(next);
      setState({ project: next, loading: false, saving: false, error: null });
    },
    [state.project],
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
