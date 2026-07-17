import type { CSSProperties } from 'react';
import { emptyWrap, emptyMono, emptySub } from '../lib/ui';

// Centered empty-state block: a mono headline over a muted sub-line. Reproduces
// VERBATIM the block in Library, References, Cheatsheet and Methodology. `mono` and
// `sub` are the full literal strings (including the leading "// " on the headline).
// Default padding is '80px 20px' (Library / References / Cheatsheet-tall); pass
// `padding` for Methodology ('70px 20px') or Cheatsheet's non-tall ('64px 20px').
export interface EmptyStateProps {
  mono: string;
  sub: string;
  padding?: string;
}

export function EmptyState({ mono, sub, padding }: EmptyStateProps) {
  const wrap: CSSProperties = padding ? { textAlign: 'center', padding } : emptyWrap;
  return (
    <div style={wrap}>
      <div style={emptyMono}>{mono}</div>
      <div style={emptySub}>{sub}</div>
    </div>
  );
}
