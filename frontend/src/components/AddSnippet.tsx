import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { Modal } from './Modal';
import { MONO, inputBase, monoInput, optBase, optOn, cardIconBtn } from '../lib/ui';
import { TagPicker, mergeTags } from './TagPicker';
import { extractLocalTokens, isLocalName } from '../lib/vars';
import type { SnippetLocal, SnippetStep } from '../types';

// « + Snippet » add/edit modal (v0.9.0). Same shape and chrome as <AddCommand>
// (category chips + '+' new category, shared inputs, <TagPicker>, <Modal sticky>),
// plus the two editors a chain needs: an ORDERED step list and the snippet's
// LOCAL variable declarations.
//
// Declaration is what makes a lowercase $token a variable at all (lib/vars.ts), so
// the modal mirrors the sidebar's « Détectées » strip locally: any $lowercase used
// in a step template but not yet declared is offered for one-click declaration.

const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' };
const hint: CSSProperties = { color: 'var(--faint)', fontFamily: MONO };
const chipsRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' };
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
const newCatInput: CSSProperties = { ...inputBase, marginTop: '8px', fontSize: '12.5px', padding: '7px 10px' };
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
const stepBox: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  padding: '10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '7px',
};
const stepBar: CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px' };
const stepNum: CSSProperties = { fontFamily: MONO, fontSize: '11px', color: 'var(--acc)', flex: 'none' };
const addRowBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const smallSelect: CSSProperties = { ...inputBase, width: 'auto', fontSize: '11.5px', padding: '4px 6px' };
const localRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px' };
const detectedChip: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  padding: '3px 8px',
  fontSize: '11.5px',
  fontFamily: MONO,
};

const noAutofix = { spellCheck: false, autoCorrect: 'off', autoCapitalize: 'off' } as const;
const uniqueSorted = <T,>(xs: T[]): T[] => [...new Set(xs)].sort();
const blankStep = (): SnippetStep => ({ id: 'ss' + crypto.randomUUID(), template: '' });

export function AddSnippet() {
  const {
    addingSnippet,
    editingSnippetId,
    setAddingSnippet,
    addSnippet,
    updateSnippet,
    categories,
    snippets,
  } = useStore();

  const firstCat = categories[0]?.key ?? '';

  const [category, setCategory] = useState(firstCat);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [steps, setSteps] = useState<SnippetStep[]>([blankStep()]);
  const [locals, setLocals] = useState<SnippetLocal[]>([]);
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existingTags = useMemo(() => uniqueSorted(snippets.flatMap((sn) => sn.tags)), [snippets]);

  // Lowercase tokens used in the step templates but not declared yet.
  const detected = useMemo(() => {
    const declared = new Set(locals.map((l) => l.name));
    const out: string[] = [];
    for (const st of steps) {
      for (const tok of extractLocalTokens(st.template)) {
        if (!declared.has(tok) && !out.includes(tok)) out.push(tok);
      }
    }
    return out;
  }, [steps, locals]);

  // Prefill on the open transition only (mirrors AddCommand).
  useEffect(() => {
    if (!addingSnippet) return;
    const sn = editingSnippetId ? snippets.find((x) => x.id === editingSnippetId) : null;
    if (sn) {
      setCategory(sn.category);
      setTitle(sn.title);
      setDesc(sn.desc);
      setSteps(sn.steps.length ? sn.steps.map((st) => ({ ...st })) : [blankStep()]);
      setLocals(sn.locals.map((l) => ({ ...l })));
      setTagsSel(sn.tags.slice());
    } else {
      setCategory(firstCat);
      setTitle('');
      setDesc('');
      setSteps([blankStep()]);
      setLocals([]);
      setTagsSel([]);
    }
    setNewCatOpen(false);
    setNewCategory('');
    setTagsText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingSnippet, editingSnippetId]);

  if (!addingSnippet) return null;

  const close = () => setAddingSnippet(false);
  const toggleTag = (t: string) =>
    setTagsSel((sel) => (sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t]));

  const patchStep = (i: number, patch: Partial<SnippetStep>) =>
    setSteps((ss) => ss.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((ss) => {
      const j = i + dir;
      if (j < 0 || j >= ss.length) return ss;
      const a = ss.slice();
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const removeStep = (i: number) =>
    setSteps((ss) => (ss.length === 1 ? ss : ss.filter((_, j) => j !== i)));

  const declare = (name: string) =>
    setLocals((ls) => (ls.some((l) => l.name === name) ? ls : [...ls, { name }]));
  const patchLocal = (i: number, patch: Partial<SnippetLocal>) =>
    setLocals((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLocal = (i: number) => {
    const gone = locals[i]?.name;
    setLocals((ls) => ls.filter((_, j) => j !== i));
    // A step can no longer yield a local that is not declared any more.
    if (gone) setSteps((ss) => ss.map((st) => (st.produces === gone ? { ...st, produces: '' } : st)));
  };

  const submit = () => {
    if (!title.trim()) {
      setError('Titre requis.');
      return;
    }
    if (!steps.some((st) => st.template.trim())) {
      setError('Au moins une étape avec une commande.');
      return;
    }
    const bad = locals.find((l) => l.name.trim() && !isLocalName(l.name.trim()));
    if (bad) {
      setError('Variable locale invalide : « ' + bad.name + ' » (minuscules, ex : svc_ntlm).');
      return;
    }
    const tags = mergeTags(tagsSel, tagsText);
    const payload = { category, newCategory, title, desc, tags, steps, locals };
    const ok = editingSnippetId
      ? updateSnippet(editingSnippetId, payload)
      : addSnippet(payload);
    if (ok) close();
  };

  return (
    <Modal
      title={editingSnippetId ? 'Modifier le snippet' : 'Nouveau snippet'}
      onClose={close}
      sticky
      footer={
        <>
          {error && <div style={errStyle}>{error}</div>}
          <button onClick={close} style={cancelBtn}>
            Annuler
          </button>
          <button onClick={submit} style={submitBtn}>
            {editingSnippetId ? 'Enregistrer' : 'Ajouter'}
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
        <div style={fieldLabel}>Titre du snippet</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex : Silver ticket (CIFS)"
          {...noAutofix}
          style={inputBase}
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

      {/* --- Variables locales --------------------------------------------- */}
      <div>
        <div style={fieldLabel}>
          Variables locales{' '}
          <span style={hint}>— minuscules, valeurs jamais enregistrées</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {locals.map((l, i) => (
            <div key={i} style={localRow}>
              <span style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--acc)', flex: 'none' }}>$</span>
              <input
                value={l.name}
                onChange={(e) => patchLocal(i, { name: e.target.value.toLowerCase() })}
                placeholder="svc_ntlm"
                {...noAutofix}
                autoComplete="off"
                style={{ ...monoInput, flex: '0 0 30%' }}
              />
              <input
                value={l.hint ?? ''}
                onChange={(e) => patchLocal(i, { hint: e.target.value })}
                placeholder="À quoi ça correspond (optionnel)"
                {...noAutofix}
                autoComplete="off"
                style={inputBase}
              />
              <button type="button" onClick={() => removeLocal(i)} title="Retirer" style={cardIconBtn}>
                ✕
              </button>
            </div>
          ))}
          <div style={chipsRow}>
            <button type="button" onClick={() => setLocals((ls) => [...ls, { name: '' }])} style={addRowBtn}>
              + variable locale
            </button>
            {detected.length > 0 && (
              <>
                <span style={{ fontSize: '11px', color: 'var(--faint)' }}>détectées :</span>
                {detected.map((n) => (
                  <button key={n} type="button" onClick={() => declare(n)} style={detectedChip} title="Déclarer">
                    + ${n}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- Étapes -------------------------------------------------------- */}
      <div>
        <div style={fieldLabel}>
          Étapes <span style={hint}>— exécutées l'une après l'autre</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {steps.map((st, i) => (
            <div key={st.id} style={stepBox}>
              <div style={stepBar}>
                <span style={stepNum}>{String(i + 1).padStart(2, '0')}</span>
                <input
                  value={st.label ?? ''}
                  onChange={(e) => patchStep(i, { label: e.target.value })}
                  placeholder="Libellé de l'action (optionnel)"
                  {...noAutofix}
                  autoComplete="off"
                  style={inputBase}
                />
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  title="Monter"
                  style={cardIconBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  title="Descendre"
                  style={cardIconBtn}
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeStep(i)} title="Retirer" style={cardIconBtn}>
                  ✕
                </button>
              </div>
              <textarea
                value={st.template}
                onChange={(e) => patchStep(i, { template: e.target.value })}
                rows={2}
                placeholder="mimikatz # sekurlsa::logonpasswords"
                {...noAutofix}
                style={templateInput}
              />
              <div style={{ ...stepBar, gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', flex: 'none' }}>
                  produit
                </span>
                <select
                  value={st.produces ?? ''}
                  onChange={(e) => patchStep(i, { produces: e.target.value })}
                  style={smallSelect}
                >
                  <option value="">(rien)</option>
                  {locals
                    .filter((l) => isLocalName(l.name.trim()))
                    .map((l) => (
                      <option key={l.name} value={l.name}>
                        ${l.name}
                      </option>
                    ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--faint)' }}>
                  la saisie apparaîtra sous cette étape
                </span>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setSteps((ss) => [...ss, blankStep()])} style={addRowBtn}>
            + étape
          </button>
        </div>
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
