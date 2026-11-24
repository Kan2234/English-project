import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Bundle } from './types';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Bundle };

const DataContext = createContext<State>({ status: 'loading' });

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetch(assetUrl('toeic.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`Không tải được dữ liệu đề thi (HTTP ${r.status}).`);
        return r.json() as Promise<Bundle>;
      })
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((e: Error) => alive && setState({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, []);
  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useDataState() {
  return useContext(DataContext);
}

/** Only call inside <DataGate>, where data is guaranteed to be loaded. */
export function useData(): Bundle {
  const s = useContext(DataContext);
  if (s.status !== 'ready') throw new Error('useData() used before data was loaded');
  return s.data;
}
