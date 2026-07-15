import type { CSSProperties } from 'react';
import { useStore } from './store';
import { themeTokens } from './lib/theme';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/views/Library';
import { Methodology } from './components/views/Methodology';
import { References } from './components/views/References';
import { Cheatsheet } from './components/views/Cheatsheet';
import { Toast } from './components/Toast';

// Root application shell. Faithful port of the prototype's three-region layout:
// a fixed 53px top bar, then a flex row of the 272px sidebar + the routed content
// region. The root element carries the theme token CSS custom properties so every
// descendant can reference var(--bg), var(--acc)… exactly like the prototype root.
export default function App() {
  const { theme, view } = useStore();

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

  return (
    <div style={rootStyle}>
      <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopBar />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Sidebar />
          {/* Content region. R4: a hard ~900px floor lives on THIS region only, so
              the horizontal scroll kicks in once the pane itself drops below 900px
              (the sidebar's 272px is reclaimed first). No mobile reflow. */}
          <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'auto' }}>
            <div style={{ minWidth: '900px' }}>
              {view === 'library' && <Library />}
              {view === 'method' && <Methodology />}
              {view === 'refs' && <References />}
              {view === 'cheatsheet' && <Cheatsheet />}
            </div>
          </div>
        </div>
      </div>
      <Toast />
    </div>
  );
}
