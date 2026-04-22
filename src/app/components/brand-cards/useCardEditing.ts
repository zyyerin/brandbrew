import { useState, useEffect, useRef, useCallback } from "react";

const EDIT_ENTER_EVENT = "bb:card-edit-enter";
export const EDIT_EXIT_EVENT = "bb:card-edit-exit";
let _instanceCounter = 0;

interface CardEditingOptions<T> {
  onChange?: (data: T) => void;
  transformOnSave?: (data: T) => T;
}

export function useCardEditing<T extends object>(
  props: T,
  opts?: CardEditingOptions<T>,
) {
  const instanceId = useRef(++_instanceCounter);
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<T>(props);
  const localRef = useRef<T>(local);
  const isEditingRef = useRef(false);
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
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) setLocal(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedProps, isEditing]);

  // Listen for another card entering edit mode or triggering a toggle-active.
  // Cancel our own edit (without saving) when that happens.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: number | string }>;
      if (ce.detail.id !== instanceId.current && isEditingRef.current) {
        setIsEditing(false);
        setLocal(JSON.parse(serializedPropsRef.current) as T);
      }
    };
    window.addEventListener(EDIT_ENTER_EVENT, handler);
    return () => window.removeEventListener(EDIT_ENTER_EVENT, handler);
  }, []);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value })), []);

  const onEditEnter = useCallback(() => {
    setIsEditing(true);
    window.dispatchEvent(new CustomEvent(EDIT_ENTER_EVENT, { detail: { id: instanceId.current } }));
  }, []);

  const onEditSave = useCallback(() => {
    const latestLocal = localRef.current;
    const isDirty = JSON.stringify(latestLocal) !== serializedPropsRef.current;
    // Exit edit mode first so UI updates immediately regardless of onChange side-effects
    setIsEditing(false);
    window.dispatchEvent(new CustomEvent(EDIT_EXIT_EVENT));
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
    window.dispatchEvent(new CustomEvent(EDIT_EXIT_EVENT));
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

/** Broadcast that a card-level action (e.g. toggle-active) has occurred.
 *  Any card currently in edit mode will cancel without saving. */
export function cancelAllCardEdits() {
  window.dispatchEvent(new CustomEvent(EDIT_ENTER_EVENT, { detail: { id: "external" } }));
}
