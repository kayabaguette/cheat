import { useStore } from '../store';
import { toastShell, toastDot } from '../lib/ui';

// Transient status toast, bottom-center — ported from the prototype's toast
// (fixed, accent-bordered, auto-dismissed by the store's flash timer).
export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    // Shared toastShell chrome + this toast's own zIndex/gap (the only bits that
    // differ from References' undoToast, so they stay at the call site).
    <div style={{ ...toastShell, zIndex: 100, gap: '8px' }}>
      <span style={toastDot} />
      {toast}
    </div>
  );
}
