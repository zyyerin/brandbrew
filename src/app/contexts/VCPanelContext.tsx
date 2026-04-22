import { createContext, useContext } from "react";

/** Effective left panel width fraction (0–1). 0 means panel is inactive. */
export const VCPanelContext = createContext<number>(0);

export function useVCPanel(): number {
  return useContext(VCPanelContext);
}
