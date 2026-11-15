import { createContext, useContext } from "react";

export const MobileCacheContext = createContext({
  restoring: false,
  signOut: (work: () => Promise<void>) => work(),
});
export const useMobileCache = () => useContext(MobileCacheContext);
