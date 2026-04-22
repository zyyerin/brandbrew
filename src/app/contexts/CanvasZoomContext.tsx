import { createContext, useContext } from "react";

export const CanvasZoomContext = createContext<number>(1);

export function useCanvasZoom(): number {
  return useContext(CanvasZoomContext);
}
