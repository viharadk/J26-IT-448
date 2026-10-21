import { createContext, PropsWithChildren, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { createSarWorkflow, SarWorkflow } from './workflow';

const Context = createContext<SarWorkflow | null>(null);
// Mounted above navigation: neither a native route pop nor leaving Function 2
// discards the session. Requests are cancelled only on invalidation/app teardown.
export function SarWorkflowProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => createSarWorkflow());
  useEffect(() => { const timer = setInterval(store.tick, 1000); return () => { clearInterval(timer); store.dispose(); }; }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useSarWorkflow() {
  const store = useContext(Context);
  if (!store) throw new Error('Function 2 requires SarWorkflowProvider.');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
