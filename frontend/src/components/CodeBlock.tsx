import { useState } from 'react';
import type { CSSProperties } from 'react';
import { toParts } from '../lib/vars';
import { codePre, prompt, partStyle } from '../lib/ui';

// Renders a command template into the A5 render states (resolved / empty / undef /
// plain) via toParts() + partStyle. Emits the leading "$ " prompt span then one
// span per part, keyed by index.
//
// The default <pre> style is codePre (the Library/Cheatsheet variant). Methodology
// renders a slightly smaller block -- pass ui.codePreCompact via `preStyle` to keep
// that view byte-identical.
//
// v0.10.0 — LOCAL variables are edited HERE, in the command itself: a $minuscule
// part is DOUBLE-CLICKED to reveal an inline input. The value is written to the
// enclosing usage context (a category+tool pair for a command, the technique/step id
// for a technique), so it propagates to every command that shares that context.
// Emptying the field drops the value and the token reads `$name` again.
//
// The input is CONTROLLED BY THE STORE, not by a draft: every keystroke lands in
// the context's value map straight away, exactly like the sidebar's global inputs
// and the technique capture fields, so all three stay in sync with no commit step.
// Escape / Enter / blur only close the editor.

// The inline editor. `font: inherit` keeps it in the <pre>'s mono at the same
// size, so the line does not jump when the span is swapped for the input.
const editInput: CSSProperties = {
  font: 'inherit',
  color: 'var(--acc)',
  background: 'var(--code)',
  border: '1px solid var(--acc-line)',
  padding: '0 3px',
  margin: 0,
  minWidth: '5ch',
};

export interface CodeBlockProps {
  template: string;
  /** Globals merged with the usage context's local values. */
  values: Record<string, string>;
  /** GLOBAL names only — a local is recognised from its name class (lib/vars.ts). */
  definedNames: Set<string>;
  preStyle?: CSSProperties;
  /**
   * Writes one local's value into the enclosing usage context. Omit it to render
   * locals read-only (no double-click affordance).
   */
  onSetLocal?: (name: string, value: string) => void;
}

export function CodeBlock({
  template,
  values,
  definedNames,
  preStyle = codePre,
  onSetLocal,
}: CodeBlockProps) {
  // Index of the part currently being edited (null = none). Keyed by index, not by
  // name, so the same variable used twice on a line opens only where it was
  // double-clicked. A local always occupies its OWN part whether it holds a value
  // or not (lib/vars.ts), so the index does not shift while typing.
  const [editing, setEditing] = useState<number | null>(null);

  const open = (i: number) => {
    // A double-click selects the word under the cursor; drop that selection so it
    // does not sit highlighted behind the input.
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* no Selection API — nothing to clear */
    }
    setEditing(i);
  };

  return (
    <pre style={preStyle}>
      <span style={prompt}>$ </span>
      {toParts(template, values, definedNames).map((p, i) => {
        const name = p.name;
        if (!p.local || !onSetLocal || name === undefined) {
          return (
            <span key={i} style={partStyle(p.state)}>
              {p.text}
            </span>
          );
        }
        if (editing === i) {
          const val = values[name] ?? '';
          return (
            <input
              key={i}
              autoFocus
              value={val}
              size={Math.max(6, val.length + 2)}
              onChange={(e) => onSetLocal(name, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditing(null);
              }}
              onBlur={() => setEditing(null)}
              spellCheck="false"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              style={editInput}
            />
          );
        }
        return (
          <span
            key={i}
            className="var-local"
            style={partStyle(p.state)}
            title={`$${name} — variable locale, double-cliquer pour définir sa valeur`}
            onDoubleClick={() => open(i)}
          >
            {p.text}
          </span>
        );
      })}
    </pre>
  );
}
