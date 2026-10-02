import { useEffect, useState } from 'react';

export type DataState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

// Loads data for a page and tracks loading / error / ready; ignores results of outdated requests.
export function useData<T>(load: () => Promise<T>, deps: unknown[]): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load()
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((error: Error) => {
        if (active) setState({ status: 'error', error: error.message });
      });
    return () => {
      active = false;
    };
    // The caller lists the dependencies of `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
