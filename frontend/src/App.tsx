import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from './store';
import { themeTokens } from './lib/theme';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/views/Library';
import { Methodology } from './components/views/Methodology';
import { Techniques } from './components/views/Techniques';
import { References } from './components/views/References';
import { Cheatsheet } from './components/views/Cheatsheet';
import { AddCommand } from './components/AddCommand';
import { AddReference } from './components/AddReference';
import { AddTechnique } from './components/AddTechnique';
import { PrintRoot } from './components/PrintRoot';
import { Toast } from './components/Toast';

// Root application shell. Faithful port of the prototype's three-region layout:
// a fixed 53px top bar, then a flex row of the 272px sidebar (foldable — Q145)
// + the routed content region. The root element carries the theme token CSS
// custom properties so every
// descendant can reference var(--bg), var(--acc)… exactly like the prototype root.
export default function App() {
  const { hydrated, theme, view, sidebarOpen } = useStore();

  // Export resolution preference — memory-only, session-scoped, default RAW.
  // Lifted here so the Cheatsheet toolbar toggle and the print-only <PrintRoot>
  // (PDF) share one source of truth: exports never substitute $TOKEN values
  // unless explicitly opted in (SPEC §9.6, OPSEC "no values on disk by default").
  const [exportResolve, setExportResolve] = useState(false);

  // themeTokens returns the CSS custom properties (--bg, --acc, --pad…). They are
  // spread onto the root element's inline style, which is how the prototype's
  // renderVals() applied its rootStyle token map.
  const rootStyle = {
    ...themeTokens(theme),
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
    fontSize: '14px',
  } as CSSProperties;

  // M3: until the initial GET /api/state resolves, render a minimal themed
  // placeholder rather than the app — this prevents flashing seed data that
  // would then be overwritten by the hydrated DB state.
  if (!hydrated) {
    return (
      <div
        style={{
          ...rootStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--muted)',
        }}
      >
        …
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopBar />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Q145: the sidebar is unmounted when folded, so its 272px go back to
              the content region (which then re-flows its card grids). */}
          {sidebarOpen && <Sidebar />}
          {/* Content region. The former hard ~900px floor (D8/R4, "no mobile
              reflow") is GONE: the card grids now collapse to a single column on
              narrow viewports instead of forcing a horizontal scroll. overflowX
              stays as a safety net for content that cannot shrink (wide code
              blocks already scroll inside their own <pre>). */}
          <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'auto' }}>
            {view === 'library' && <Library />}
            {view === 'method' && <Methodology />}
            {view === 'techniques' && <Techniques />}
            {view === 'refs' && <References />}
            {view === 'cheatsheet' && (
              <Cheatsheet exportResolve={exportResolve} setExportResolve={setExportResolve} />
            )}
          </div>
        </div>
      </div>
      <AddCommand />
      <AddReference />
      <AddTechnique />
      <PrintRoot resolveValues={exportResolve} />
      <Toast />
    </div>
  );
}
