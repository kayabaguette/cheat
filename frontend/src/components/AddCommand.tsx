import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { Modal } from './Modal';
import { MONO, inputBase, monoInput, optBase, optOn } from '../lib/ui';
import { TagPicker, mergeTags } from './TagPicker';

// « + Commande » add/edit modal — faithful port of the prototype's add-command
// dialog (~lines 410-459). Opened by store.adding. When store.editingCommandId
// is set the form PREFILLS from that command and submits via updateCommand;
// otherwise it submits via addCommand. Category is a row of clickable chips
// (store.categories) plus a '+' that reveals a new-category text field; the tool
// input carries a <datalist> of existing tools; tags use the shared <TagPicker>.
// The modal chrome (overlay/panel/header/close/body/footer) comes from <Modal>
// (sticky variant); the shared text-input and chip styles come from lib/ui.

const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' };
const hint: CSSProperties = { color: 'var(--faint)', fontFamily: MONO };
const chipsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  alignItems: 'center',
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
const newCatInput: CSSProperties = {
  ...inputBase,
  marginTop: '8px',
  fontSize: '12.5px',
  padding: '7px 10px',
};
const templateInput: CSSProperties = {
  ...monoInput,
  color: 'var(--code-text)',
  resize: 'vertical',
  lineHeight: 1.5,
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

// Shared input-hardening attributes. spellCheck as boolean false renders the same
// spellcheck="false" DOM attribute as the string form (React enumerated attribute).
const noAutofix = { spellCheck: false, autoCorrect: 'off', autoCapitalize: 'off' } as const;

// Unique + default (lexicographic) sort — for the tool datalist and existing tags.
const uniqueSorted = <T,>(xs: T[]): T[] => [...new Set(xs)].sort();

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

  const [category, setCategory] = useState(firstCat);
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
  const toolSuggestions = useMemo(() => uniqueSorted(commands.map((c) => c.tool)), [commands]);
  const existingTags = useMemo(() => uniqueSorted(commands.flatMap((c) => c.tags)), [commands]);

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
      updateCommand(editingCommandId, { category, newCategory, tool, title, template, desc, tags });
    } else {
      addCommand({ category, newCategory, tool, title, template, desc, tags });
    }
  };

  return (
    <Modal
      title={editingCommandId ? 'Modifier la commande' : 'Nouvelle commande'}
      onClose={close}
      sticky
      footer={
        <>
          {error && <div style={errStyle}>{error}</div>}
          <button onClick={close} style={cancelBtn}>
            Annuler
          </button>
          <button onClick={submit} style={submitBtn}>
            {editingCommandId ? 'Enregistrer' : 'Ajouter'}
          </button>
        </>
      }
    >
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
            {...noAutofix}
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
          {...noAutofix}
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
          {...noAutofix}
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
          {...noAutofix}
          style={templateInput}
        />
      </div>

      <div>
        <div style={fieldLabel}>Description</div>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Optionnel"
          {...noAutofix}
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
    </Modal>
  );
}
