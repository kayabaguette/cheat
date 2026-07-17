import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';

// Copy-to-clipboard icon button shared by Library, Cheatsheet and Methodology.
// Preserves the exact icon(s), the "copied" feedback and the toast text:
//   success -> flash('Copié dans le presse-papier')
//   failure -> flash('Échec de la copie')
//
// BUG FIX (findings methodology-6 / cheatsheet-4): the original helpers flashed
// success even when navigator.clipboard was undefined (nothing was written). Here
// success is flashed ONLY when the write actually resolves; a missing clipboard
// API, a rejected promise, or a synchronous throw flashes the failure toast
// instead. This is the single intended behavior change vs the verbatim ports.
//
// Variants (the call sites differ):
//   variant='class'  -> the .copy-btn / .copy-btn.copied CSS button used by Library
//                       and Cheatsheet. Tracks a local ~1200ms "copied" state.
//   variant='inline' -> Methodology's absolutely-positioned inline button; no
//                       copied-state tracking (matches copyCmd, which showed none).
//   swapIcon=true    -> swap the copy glyph for the check glyph while copied
//                       (Library only; Cheatsheet keeps the copy glyph).

const copyBtnInline: CSSProperties = {
  position: 'absolute',
  top: '22px',
  right: '7px',
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--code)',
  color: 'var(--muted)',
  padding: '4px 5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <rect x="9" y="9" width="12" height="12" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export interface CopyButtonProps {
  /** The exact text to write (callers pass resolve(template, values)). */
  text: string;
  variant?: 'class' | 'inline';
  swapIcon?: boolean;
  title?: string;
}

export function CopyButton({
  text,
  variant = 'class',
  swapIcon = false,
  title = 'Copier',
}: CopyButtonProps) {
  const { flash } = useStore();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSuccess = () => {
    flash('Copié dans le presse-papier');
    if (variant === 'class') {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    }
  };
  const onFailure = () => flash('Échec de la copie');

  const onClick = () => {
    try {
      const p = navigator.clipboard?.writeText(text);
      if (p && typeof p.then === 'function') {
        p.then(onSuccess, onFailure);
      } else {
        // No clipboard API (non-secure context / older browser): nothing was
        // written, so report failure instead of a false success (the fix).
        onFailure();
      }
    } catch {
      onFailure();
    }
  };

  if (variant === 'inline') {
    return (
      <button onClick={onClick} title={title} style={copyBtnInline}>
        <CopyIcon />
      </button>
    );
  }
  return (
    <button onClick={onClick} title={title} className={copied ? 'copy-btn copied' : 'copy-btn'}>
      {swapIcon && copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
