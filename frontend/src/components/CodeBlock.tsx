import type { CSSProperties } from 'react';
import { toParts } from '../lib/vars';
import { codePre, prompt, partStyle } from '../lib/ui';

// Renders a command template into the A5 three render states (resolved / empty /
// undef / plain) via toParts() + partStyle, exactly as Library.tsx, Cheatsheet.tsx
// and Methodology.tsx do inline. Emits the leading "$ " prompt span then one span
// per part, keyed by index -- markup, keys and styles reproduced VERBATIM.
//
// The default <pre> style is codePre (the Library/Cheatsheet variant). Methodology
// renders a slightly smaller block -- pass ui.codePreCompact via `preStyle` to keep
// that view byte-identical.
export interface CodeBlockProps {
  template: string;
  values: Record<string, string>;
  definedNames: Set<string>;
  preStyle?: CSSProperties;
}

export function CodeBlock({ template, values, definedNames, preStyle = codePre }: CodeBlockProps) {
  return (
    <pre style={preStyle}>
      <span style={prompt}>$ </span>
      {toParts(template, values, definedNames).map((p, i) => (
        <span key={i} style={partStyle(p.state)}>
          {p.text}
        </span>
      ))}
    </pre>
  );
}
