import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { TagPicker, mergeTags } from './TagPicker';

// « Nouvelle référence » modal — faithful port of the prototype's addRef dialog
// (~lines 461-492). Opened by store.addingRef, driven by local draft state
// (title / url / desc / tags). Title + URL are required and the URL must be
// parseable; on submit the draft is handed to store.addReference (which
// normalizes + sanitizes the URL, mints the id and closes the modal on success).

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(6,7,9,.66)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 80,
  padding: '20px',
};
const panel: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  maxHeight: '90vh',
  overflowY: 'auto',
  background: 'var(--card)',
  border: '1px solid var(--border2)',
  boxShadow: '0 20px 60px rgba(0,0,0,.4)',
};
const header: CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const closeBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: '16px',
};
const body: CSSProperties = {
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};
const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' };
const inputBase: CSSProperties = {
  width: '100%',
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '8px 10px',
};
const urlInput: CSSProperties = {
  ...inputBase,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12.5px',
};
const descInput: CSSProperties = { ...inputBase, resize: 'vertical', lineHeight: 1.5 };
const footer: CSSProperties = {
  padding: '14px 20px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '9px',
  alignItems: 'center',
};
const errStyle: CSSProperties = { flex: 1, color: '#e5484d', fontSize: '12px' };
const cancelBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--text)',
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const submitBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc)',
  color: 'var(--on-acc)',
  padding: '8px 16px',
  fontSize: '12.5px',
  fontWeight: 700,
  fontFamily: 'inherit',
};

// Local pre-flight check mirroring store.addReference so we can surface an inline
// message instead of only a toast: title + url required, url must be parseable.
function validate(title: string, url: string): string | null {
  if (!title.trim() || !url.trim()) return 'Titre et URL requis.';
  let u = url.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return 'URL invalide.';
  } catch {
    return 'URL invalide.';
  }
  return null;
}

export function AddReference() {
  const { addingRef, setAddingRef, addReference, references } = useStore();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Existing reference tags, offered as reusable clickable chips.
  const existingTags = useMemo(
    () => [...new Set(references.flatMap((r) => r.tags))].sort(),
    [references],
  );
  const toggleTag = (t: string) =>
    setTagsSel((sel) => (sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t]));

  if (!addingRef) return null;

  const reset = () => {
    setTitle('');
    setUrl('');
    setDesc('');
    setTagsSel([]);
    setTagsText('');
    setError(null);
  };

  const close = () => {
    reset();
    setAddingRef(false);
  };

  const submit = () => {
    const err = validate(title, url);
    if (err) {
      setError(err);
      return;
    }
    const ok = addReference({
      title,
      url,
      desc,
      tags: mergeTags(tagsSel, tagsText),
    });
    // addReference closes the modal (store) on success; reset local draft too.
    if (ok) reset();
    else setError('URL invalide.');
  };

  return (
    <div onClick={close} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={header}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouvelle référence</div>
          <button onClick={close} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={body}>
          <div>
            <div style={fieldLabel}>Titre</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : HackTricks"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={inputBase}
            />
          </div>
          <div>
            <div style={fieldLabel}>URL</div>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={urlInput}
            />
          </div>
          <div>
            <div style={fieldLabel}>Description</div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="À quoi sert ce lien ?"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={descInput}
            />
          </div>
          <TagPicker
            all={existingTags}
            selected={tagsSel}
            onToggle={toggleTag}
            text={tagsText}
            onText={setTagsText}
          />
        </div>

        <div style={footer}>
          {error && <div style={errStyle}>{error}</div>}
          <button onClick={close} style={cancelBtn}>
            Annuler
          </button>
          <button onClick={submit} style={submitBtn}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
