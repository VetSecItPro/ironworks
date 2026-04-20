import { useCallback, useEffect, useRef, useState } from "react";
import { projectsApi } from "../../api/projects";
import type { ProjectConfigFieldKey, ProjectFieldSaveState } from "../ProjectProperties";

export function useProjectFieldSave(
  projectLookupRef: string,
  resolvedCompanyId: string | undefined | null,
  lookupCompanyId: string | undefined,
  invalidateProject: () => void,
) {
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ProjectConfigFieldKey, ProjectFieldSaveState>>>(
    {},
  );
  const fieldSaveRequestIds = useRef<Partial<Record<ProjectConfigFieldKey, number>>>({});
  const fieldSaveTimers = useRef<Partial<Record<ProjectConfigFieldKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    return () => {
      Object.values(fieldSaveTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setFieldState = useCallback((field: ProjectConfigFieldKey, state: ProjectFieldSaveState) => {
    setFieldSaveStates((current) => ({ ...current, [field]: state }));
  }, []);

  const scheduleFieldReset = useCallback((field: ProjectConfigFieldKey, delayMs: number) => {
    const existing = fieldSaveTimers.current[field];
    if (existing) clearTimeout(existing);
    fieldSaveTimers.current[field] = setTimeout(() => {
      setFieldSaveStates((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      delete fieldSaveTimers.current[field];
    }, delayMs);
  }, []);

  const updateProjectField = useCallback(
    async (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
      const requestId = (fieldSaveRequestIds.current[field] ?? 0) + 1;
      fieldSaveRequestIds.current[field] = requestId;
      setFieldState(field, "saving");
      try {
        await projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId);
        invalidateProject();
        if (fieldSaveRequestIds.current[field] !== requestId) return;
        setFieldState(field, "saved");
        scheduleFieldReset(field, 1800);
      } catch (error) {
        if (fieldSaveRequestIds.current[field] !== requestId) return;
        setFieldState(field, "error");
        scheduleFieldReset(field, 3000);
        throw error;
      }
    },
    [invalidateProject, lookupCompanyId, projectLookupRef, resolvedCompanyId, scheduleFieldReset, setFieldState],
  );

  const getFieldSaveState = useCallback(
    (field: ProjectConfigFieldKey): ProjectFieldSaveState => {
      return fieldSaveStates[field] ?? "idle";
    },
    [fieldSaveStates],
  );

  return { updateProjectField, getFieldSaveState };
}
