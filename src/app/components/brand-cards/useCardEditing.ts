import { useState, useEffect, useRef, useCallback } from "react";

interface CardEditingOptions<T> {
  onChange?: (data: T) => void;
  transformOnSave?: (data: T) => T;
}

export function useCardEditing<T extends Record<string, unknown>>(
  props: T,
  opts?: CardEditingOptions<T>,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<T>(props);
  const localRef = useRef<T>(local);
  // Keep a stable ref to opts so callbacks don't go stale
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const serializedProps = JSON.stringify(props);
  // Keep a stable ref to the latest serializedProps for use inside callbacks
  const serializedPropsRef = useRef(serializedProps);
  serializedPropsRef.current = serializedProps;

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    if (!isEditing) setLocal(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedProps, isEditing]);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value })), []);

  const onEditEnter = useCallback(() => setIsEditing(true), []);

  const onEditSave = useCallback(() => {
    const latestLocal = localRef.current;
    const isDirty = JSON.stringify(latestLocal) !== serializedPropsRef.current;
    // Exit edit mode first so UI updates immediately regardless of onChange side-effects
    setIsEditing(false);
    if (isDirty) {
      const currentOpts = optsRef.current;
      const result = currentOpts?.transformOnSave
        ? currentOpts.transformOnSave(latestLocal)
        : latestLocal;
      currentOpts?.onChange?.(result);
    }
  }, []);

  const onEditCancel = useCallback(() => {
    setIsEditing(false);
    // Reset to latest committed props via ref to avoid stale closure
    setLocal(JSON.parse(serializedPropsRef.current) as T);
  }, []);

  const editingProps = {
    isEditing,
    onEditEnter,
    onEditSave,
    onEditCancel,
  };

  return { isEditing, local, setLocal, updateField, editingProps };
}
