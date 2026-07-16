// Core domain types for the Cheat app (M0 scaffold).
// Faithful port of the DCLogic prototype's data shapes, restructured per the SPEC.

export interface Category {
  key: string;
  label: string;
  color: string;
}

export interface Command {
  id: string;
  category: string;
  tool: string;
  title: string;
  template: string;
  desc: string;
  tags: string[];
}

export interface Reference {
  id: string;
  title: string;
  url: string;
  desc: string;
  tags: string[];
}

export interface Cheatsheet {
  id: string;
  title: string;
  target: string;
  commandIds: string[];
}

export interface Step {
  id: string;
  text: string;
  commandId?: string;
}

export interface Phase {
  id: string;
  label: string;
  steps: Step[];
}

export interface Roadmap {
  id: string;
  label: string;
  phases: Phase[];
}

export interface VariableDef {
  name: string;
  isBuiltin: boolean;
  sensitive: boolean;
}

export type ViewKey = 'library' | 'method' | 'refs' | 'cheatsheet';

export type ThemeName = 'dark' | 'light';

// A5 — the three variable render states, plus untouched literal text.
//   resolved : name is defined AND has a non-empty value
//   empty    : name is defined but its value is empty
//   undef    : the $TOKEN is not a defined variable name
//   plain    : ordinary text (or an escaped \$ rendered as '$')
export interface Part {
  text: string;
  state: 'plain' | 'resolved' | 'empty' | 'undef';
}
