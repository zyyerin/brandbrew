import { createContext, useContext } from "react";

export const VSPanelContext = createContext<boolean>(false);

export function useVSPanel(): boolean {
  return useContext(VSPanelContext);
}
