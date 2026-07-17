import type { CSSProperties, ReactNode } from 'react';

// Shared modal shell for the AddCommand and AddReference forms (finding cross-7):
// a click-outside-to-close overlay + centered panel + header (title + close btn) +
// body slot + optional footer slot. The overlay / panel / header / close / body
// styles are reproduced VERBATIM from AddCommand.tsx and AddReference.tsx.
//
// The two forms differ in exactly two ways, exposed as props so both stay
// byte-identical:
//   maxWidth : panel max width -- AddCommand '540px', AddReference '500px'
//              (default '540px').
//   sticky   : AddCommand's header + footer are position:sticky with a --card
//              background; AddReference's are not (default false).

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
const titleStyle: CSSProperties = { fontWeight: 600, fontSize: '14px' };

function panelStyle(maxWidth: string): CSSProperties {
  return {
    width: '100%',
    maxWidth,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'var(--card)',
    border: '1px solid var(--border2)',
    boxShadow: '0 20px 60px rgba(0,0,0,.4)',
  };
}
function headerStyle(sticky: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
  return sticky ? { ...base, position: 'sticky', top: 0, background: 'var(--card)' } : base;
}
function footerStyle(sticky: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '14px 20px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '9px',
    alignItems: 'center',
  };
  return sticky ? { ...base, position: 'sticky', bottom: 0, background: 'var(--card)' } : base;
}

export interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  sticky?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = '540px',
  sticky = false,
}: ModalProps) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panelStyle(maxWidth)}>
        <div style={headerStyle(sticky)}>
          <div style={titleStyle}>{title}</div>
          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
        {footer !== undefined && <div style={footerStyle(sticky)}>{footer}</div>}
      </div>
    </div>
  );
}
