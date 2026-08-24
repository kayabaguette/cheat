import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { resolve } from '../lib/vars';
import { codeWrap } from '../lib/ui';
import { CodeBlock } from './CodeBlock';
import { CheckIcon } from './CopyButton';

// One line of a snippet, copied by clicking ANYWHERE on it (0.9.0). A snippet is
// a chain that cannot be run in one go, so the whole line is the click target
// and the copy icon only flashes at its right end on success — the affordance
// used by the OSCP docs.
//
// Renders through <CodeBlock>, so the variable render states (§5.10) and the
// markup are exactly those of the other views; only the wrapper is clickable.
//
// The clipboard receives the RESOLVED line — globals AND the context's locals
// (Q99: the clipboard resolves, file exports do not). That is the entire point:
// paste it and run it.

// The transient icon, in the slot the .copy-btn occupies elsewhere (codePre
// reserves paddingRight: 44px, so it never overlaps the text).
const iconSlot: CSSProperties = {
  position: 'absolute',
  top: '9px',
  right: '9px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 4px',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  pointerEvents: 'none',
};

export interface CommandLineProps {
  template: string;
  /** Globals merged with the usage context's local values. */
  values: Record<string, string>;
  definedNames: Set<string>;
  preStyle?: CSSProperties;
}

export function CommandLine({ template, values, definedNames, preStyle }: CommandLineProps) {
  const { flash } = useStore();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClick = () => {
    // Never hijack a text selection: dragging across the line to grab a fragment
    // must stay possible, so a click that ends a selection copies nothing.
    try {
      if ((window.getSelection()?.toString() ?? '') !== '') return;
    } catch {
      /* no Selection API — fall through and copy */
    }
    const onSuccess = () => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 900);
      flash('Copié dans le presse-papier');
    };
    const onFailure = () => flash('Échec de la copie');
    try {
      const p = navigator.clipboard?.writeText(resolve(template, values));
      // navigator.clipboard is ABSENT in a non-secure context — which is the norm
      // here, since the app is served over plain HTTP on the LAN. Nothing was
      // written, so report the failure and do NOT flash the icon: a false success
      // would have the user paste an empty clipboard (same rule as <CopyButton>).
      if (p && typeof p.then === 'function') p.then(onSuccess, onFailure);
      else onFailure();
    } catch {
      onFailure();
    }
  };

  return (
    <div
      style={{ ...codeWrap, cursor: 'pointer' }}
      onClick={onClick}
      title="Cliquer pour copier la ligne"
    >
      <CodeBlock
        template={template}
        values={values}
        definedNames={definedNames}
        preStyle={preStyle}
      />
      {copied && (
        <span style={iconSlot}>
          <CheckIcon />
        </span>
      )}
    </div>
  );
}
