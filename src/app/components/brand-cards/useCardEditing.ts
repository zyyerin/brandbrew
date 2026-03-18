import { useState, useEffect, useRef } from "react";

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

  const serializedProps = JSON.stringify(props);
  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    if (!isEditing) setLocal(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedProps, isEditing]);

  const updateField = <K extends keyof T>(key: K, value: T[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const editingProps = {
    isEditing,
    onEditEnter: () => setIsEditing(true),
    onEditSave: () => {
      const latestLocal = localRef.current;
      const isDirty = JSON.stringify(latestLocal) !== serializedProps;
      setIsEditing(false);
      if (isDirty) {
        const result = opts?.transformOnSave ? opts.transformOnSave(latestLocal) : latestLocal;
        opts?.onChange?.(result);
      }
    },
    onEditCancel: () => {
      setIsEditing(false);
      setLocal(props);
    },
  };

  return { isEditing, local, setLocal, updateField, editingProps };
}
