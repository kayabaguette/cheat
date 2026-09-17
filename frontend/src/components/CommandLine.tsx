import type { CSSProperties } from 'react';
import { resolve } from '../lib/vars';
import { codeWrap } from '../lib/ui';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';

// One line of a technique chain.
//
// v0.10.0 — THE COPY BUTTON IS BACK and clicking the line does nothing. 0.9.0 had
// made the whole line a copy target; that spent the line's click gesture, and a
// local variable is now edited by DOUBLE-CLICKING it right there in the command —
// a double-click being two clicks, entering the editor would have copied the line
// twice on the way in. The button is the shared `.copy-btn` of the Library and the
// Cheatsheet, so a technique line and a command card now copy the same way, and the
// two guards 0.9.0 needed for a whole-line target (don't hijack a text selection,
// don't fake success without navigator.clipboard) collapse into <CopyButton>'s own
// single, already-tested clipboard path.
//
// Renders through <CodeBlock>, so the variable render states (§5.10), the markup
// and the double-click editor are exactly those of the other views.
//
// The clipboard receives the RESOLVED line — globals AND the context's locals
// (Q99: the clipboard resolves, file exports do not). That is the entire point:
// paste it and run it.

export interface CommandLineProps {
  template: string;
  /** Globals merged with the usage context's local values. */
  values: Record<string, string>;
  definedNames: Set<string>;
  preStyle?: CSSProperties;
  /** Writes one local's value into the enclosing usage context. */
  onSetLocal?: (name: string, value: string) => void;
}

export function CommandLine({
  template,
  values,
  definedNames,
  preStyle,
  onSetLocal,
}: CommandLineProps) {
  return (
    <div style={codeWrap}>
      <CopyButton text={resolve(template, values)} swapIcon title="Copier la ligne" />
      <CodeBlock
        template={template}
        values={values}
        definedNames={definedNames}
        preStyle={preStyle}
        onSetLocal={onSetLocal}
      />
    </div>
  );
}
