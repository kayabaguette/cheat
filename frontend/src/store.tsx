import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeName, ViewKey } from './types';
import { INITIAL_VALUES } from './data/seed';

// In-memory app state. Variable VALUES live here only — never persisted to the
// DB, localStorage, or the JSON export (SPEC §2.6, D2/D7). They are seeded with
// the prototype's demo values so variable resolution is visible immediately.
export interface StoreState {
  theme: ThemeName;
  view: ViewKey;
  values: Record<string, string>;
  activeCat: string | null;
  activeTool: string | null;
  activeTag: string | null;
  query: string;
  selected: string[];
}

export interface StoreActions {
  toggleTheme: () => void;
  setView: (v: ViewKey) => void;
  setValue: (name: string, val: string) => void;
  setActiveCat: (k: string | null) => void;
  setActiveTool: (t: string | null) => void;
  setActiveTag: (t: string | null) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;
  toggleSelected: (id: string) => void;
}

export type Store = StoreState & StoreActions;

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [view, setView] = useState<ViewKey>('library');
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...INITIAL_VALUES }));
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const setValue = useCallback((name: string, val: string) => {
    setValues((v) => ({ ...v, [name]: val }));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCat(null);
    setActiveTool(null);
    setActiveTag(null);
    setQuery('');
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }, []);

  const store = useMemo<Store>(
    () => ({
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      query,
      selected,
      toggleTheme,
      setView,
      setValue,
      setActiveCat,
      setActiveTool,
      setActiveTag,
      setQuery,
      clearFilters,
      toggleSelected,
    }),
    [
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      query,
      selected,
      toggleTheme,
      setValue,
      clearFilters,
      toggleSelected,
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useStore must be used within a <StoreProvider>');
  }
  return ctx;
}
