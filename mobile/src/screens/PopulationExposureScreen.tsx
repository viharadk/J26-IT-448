import { useEffect, useState, useSyncExternalStore } from 'react';
import { PopulationExposureView } from '../components/PopulationExposureView';
import { createPopulationController } from '../population/exposure';

// One controller per pushed results route. The existing Function1 route stays
// underneath; native-stack owns header/system Back and pops only this screen.
export function PopulationExposureScreen() {
  const [store] = useState(() => createPopulationController());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);
  return <PopulationExposureView state={state} onRetry={() => { void store.load(); }} />;
}
