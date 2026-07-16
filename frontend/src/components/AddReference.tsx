import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { TagPicker, mergeTags } from './TagPicker';

// « Nouvelle référence » / « Modifier la référence » modal — faithful port of the
// prototype's addRef dialog (~lines 461-492), extended with an edit mode.
// Opened by store.addingRef, driven by local draft state (title / url / desc /
// tags). When store.editingRefId is set the form PREFILLS from that reference and
// submits via updateReference; otherwise it submits via addReference. Both store
// actions normalize + sanitize the URL and close the modal on success.

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
  const { addingRef, editingRefId, setAddingRef, addReference, updateReference, references } =
    useStore();

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

  // Prefill on open: edit mode hydrates from the target reference, add mode
  // resets to empty. Keyed only on the open transition (references cannot change
  // while the modal is open — add/update both close it).
  useEffect(() => {
    if (!addingRef) return;
    const ref = editingRefId ? references.find((r) => r.id === editingRefId) : null;
    if (ref) {
      setTitle(ref.title);
      setUrl(ref.url);
      setDesc(ref.desc);
      setTagsSel(ref.tags.slice());
    } else {
      setTitle('');
      setUrl('');
      setDesc('');
      setTagsSel([]);
    }
    setTagsText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingRef, editingRefId]);

  if (!addingRef) return null;

  // setAddingRef(false) also clears editingRefId in the store, so the modal
  // re-opens in add mode next time.
  const close = () => setAddingRef(false);

  const submit = () => {
    const err = validate(title, url);
    if (err) {
      setError(err);
      return;
    }
    const payload = { title, url, desc, tags: mergeTags(tagsSel, tagsText) };
    // add/updateReference close the modal (store) on success.
    const ok = editingRefId ? updateReference(editingRefId, payload) : addReference(payload);
    if (!ok) setError('URL invalide.');
  };

  return (
    <div onClick={close} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={header}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            {editingRefId ? 'Modifier la référence' : 'Nouvelle référence'}
          </div>
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
            {editingRefId ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
