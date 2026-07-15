import { useStore } from '../store';

// Transient status toast, bottom-center — ported from the prototype's toast
// (fixed, accent-bordered, auto-dismissed by the store's flash timer).
export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '22px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--elev)',
        border: '1px solid var(--acc-line)',
        color: 'var(--text)',
        padding: '9px 16px',
        fontSize: '12.5px',
        boxShadow: '0 8px 30px rgba(0,0,0,.35)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span style={{ width: '7px', height: '7px', flex: 'none', background: 'var(--acc)' }} />
      {toast}
    </div>
  );
}
