import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { TagPicker, mergeTags } from './TagPicker';

// « + Commande » add/edit modal — faithful port of the prototype's add-command
// dialog (~lines 410-459). Opened by store.adding. When store.editingCommandId
// is set the form PREFILLS from that command and submits via updateCommand;
// otherwise it submits via addCommand. Category is a row of clickable chips
// (store.categories) plus a '+' that reveals a new-category text field; the tool
// input carries a <datalist> of existing tools; tags use the shared <TagPicker>.

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
  maxWidth: '540px',
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
  position: 'sticky',
  top: 0,
  background: 'var(--card)',
};
const closeBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: '16px',
};
const bodyStyle: CSSProperties = {
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};
const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' };
const hint: CSSProperties = { color: 'var(--faint)', fontFamily: "'IBM Plex Mono', monospace" };
const chipsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  alignItems: 'center',
};
const optBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  padding: '5px 10px',
  fontSize: '11.5px',
  fontFamily: 'inherit',
};
// Full `border` shorthand (never the borderColor longhand) so deselecting a chip
// cleanly restores the base border — see the toggle-button border-color rule.
const optOn: CSSProperties = {
  ...optBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};
const newCatBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  padding: '4px 10px',
  fontSize: '14px',
  lineHeight: 1,
  fontFamily: 'inherit',
};
const inputBase: CSSProperties = {
  width: '100%',
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '8px 10px',
};
const newCatInput: CSSProperties = {
  ...inputBase,
  marginTop: '8px',
  fontSize: '12.5px',
  padding: '7px 10px',
};
const monoInput: CSSProperties = {
  ...inputBase,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12.5px',
};
const templateInput: CSSProperties = {
  ...monoInput,
  color: 'var(--code-text)',
  resize: 'vertical',
  lineHeight: 1.5,
};
const footer: CSSProperties = {
  padding: '14px 20px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '9px',
  alignItems: 'center',
  position: 'sticky',
  bottom: 0,
  background: 'var(--card)',
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

export function AddCommand() {
  const {
    adding,
    editingCommandId,
    setAdding,
    addCommand,
    updateCommand,
    categories,
    commands,
  } = useStore();

  const firstCat = categories[0]?.key ?? '';

  const [category, setCategory] = useState<string>(firstCat);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [tool, setTool] = useState('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('');
  const [desc, setDesc] = useState('');
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Existing tools (datalist) and tags (TagPicker chips), derived from all commands.
  const toolSuggestions = useMemo(
    () => [...new Set(commands.map((c) => c.tool))].sort(),
    [commands],
  );
  const existingTags = useMemo(
    () => [...new Set(commands.flatMap((c) => c.tags))].sort(),
    [commands],
  );

  // Prefill on open: edit mode hydrates from the target command, add mode resets
  // to defaults. Keyed only on the open transition (adding/editingCommandId), so
  // typing never re-runs it (commands cannot change while the modal is open).
  useEffect(() => {
    if (!adding) return;
    const cmd = editingCommandId ? commands.find((c) => c.id === editingCommandId) : null;
    if (cmd) {
      setCategory(cmd.category);
      setTool(cmd.tool);
      setTitle(cmd.title);
      setTemplate(cmd.template);
      setDesc(cmd.desc);
      setTagsSel(cmd.tags.slice());
    } else {
      setCategory(firstCat);
      setTool('');
      setTitle('');
      setTemplate('');
      setDesc('');
      setTagsSel([]);
    }
    setNewCatOpen(false);
    setNewCategory('');
    setTagsText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, editingCommandId]);

  if (!adding) return null;

  const toggleTag = (t: string) =>
    setTagsSel((sel) => (sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t]));

  const close = () => setAdding(false);

  const submit = () => {
    if (!title.trim() || !template.trim()) {
      setError('Titre et commande requis.');
      return;
    }
    const tags = mergeTags(tagsSel, tagsText);
    // addCommand / updateCommand close the modal (store) on success.
    if (editingCommandId) {
      updateCommand(editingCommandId, { category, tool, title, template, desc, tags });
    } else {
      addCommand({ category, newCategory, tool, title, template, desc, tags });
    }
  };

  return (
    <div onClick={close} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={header}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            {editingCommandId ? 'Modifier la commande' : 'Nouvelle commande'}
          </div>
          <button onClick={close} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          <div>
            <div style={fieldLabel}>Catégorie</div>
            <div style={chipsRow}>
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  style={category === c.key ? optOn : optBase}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNewCatOpen((o) => !o)}
                title="Nouvelle catégorie"
                style={newCatBtn}
              >
                +
              </button>
            </div>
            {newCatOpen && (
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nom de la nouvelle catégorie"
                spellCheck="false"
                autoCorrect="off"
                autoCapitalize="off"
                style={newCatInput}
              />
            )}
          </div>

          <div>
            <div style={fieldLabel}>
              Outil <span style={hint}>— ex : nmap, ffuf, mimikatz</span>
            </div>
            <input
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              list="cmd-tool-suggest"
              autoComplete="off"
              placeholder="Nom de l'outil"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={monoInput}
            />
            <datalist id="cmd-tool-suggest">
              {toolSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <div style={fieldLabel}>Titre de la commande</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Scan complet TCP"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={inputBase}
            />
          </div>

          <div>
            <div style={fieldLabel}>
              Commande <span style={hint}>— utilise $RHOST, $LHOST…</span>
            </div>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={2}
              placeholder="nmap -sC -sV $RHOST"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={templateInput}
            />
          </div>

          <div>
            <div style={fieldLabel}>Description</div>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optionnel"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={inputBase}
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
            {editingCommandId ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
