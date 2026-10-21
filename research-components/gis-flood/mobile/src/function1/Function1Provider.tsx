import { createContext, PropsWithChildren, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { createSelectionStore } from './selection';
const Context = createContext<ReturnType<typeof createSelectionStore> | null>(null);
export function Function1Provider({ children }: PropsWithChildren) {
  const [store] = useState(() => createSelectionStore());
  useEffect(() => () => store.dispose(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useFunction1() {
  const store = useContext(Context);
  if (!store) throw new Error('Function 1 requires its selection provider.');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
