import type { CSSProperties } from 'react';
import { MONO, optBase, optOn, inputBase } from '../lib/ui';

// Reusable tag input: shows every EXISTING tag as a clickable chip (toggle to
// reuse) plus a free-text field for brand-new comma-separated tags. Ported from
// the prototype's « + Commande » tag section; used by every add/edit form.
// The parent owns `selected` (chip picks) and `text` (free input) and merges
// them on submit — see mergeTags() below.
// Chip (optBase/optOn) + input (inputBase) styles come from lib/ui — shared
// byte-identical with AddCommand/AddReference.

const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '7px' };
const hint: CSSProperties = { color: 'var(--faint)', fontFamily: MONO };
const chipsRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' };

// Normalize a free-text tag: trim, drop a leading '#', lowercase (matches the
// stored tag convention, Q47).
function normalize(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase();
}

// Merge chip selections + parsed free text into the final unique tag list.
export function mergeTags(selected: string[], text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const n = normalize(t);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  selected.forEach(push);
  text.split(',').forEach(push);
  return out;
}

export interface TagPickerProps {
  /** Existing tags offered as reusable chips. */
  all: string[];
  /** Currently chip-selected tags. */
  selected: string[];
  /** Toggle a chip on/off. */
  onToggle: (tag: string) => void;
  /** Free-text field value (comma-separated new tags). */
  text: string;
  onText: (value: string) => void;
}

export function TagPicker({ all, selected, onToggle, text, onText }: TagPickerProps) {
  return (
    <div>
      <div style={fieldLabel}>
        Tags <span style={hint}>— clique pour réutiliser, ou saisis-en de nouveaux</span>
      </div>
      {all.length > 0 && (
        <div style={chipsRow}>
          {all.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              style={selected.includes(t) ? optOn : optBase}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <input
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Nouveaux tags séparés par des virgules"
        spellCheck="false"
        autoCorrect="off"
        autoCapitalize="off"
        style={inputBase}
      />
    </div>
  );
}
