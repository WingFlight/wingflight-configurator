import { getContext, setContext } from "svelte";

// Shared between a Section and the <Expert> blocks inside it: `hidden` counts
// the blocks currently hidden by basic mode, `revealed` shows them anyway
// without switching expert mode on globally.
const KEY = Symbol("expert-section");

export function createExpertSection() {
  const section = $state({ hidden: 0, revealed: false });
  setContext(KEY, section);
  // A Section starts fresh: its fields don't report to an outer SubSection.
  setContext(SUB_KEY, undefined);
  return section;
}

export function getExpertSection() {
  return getContext(KEY);
}

// Shared between a SubSection and the fields inside it: `items` counts its
// fields (expert or not), `hidden` those basic mode currently hides, so the
// SubSection can hide its own heading when nothing in it is showing.
const SUB_KEY = Symbol("expert-subsection");

export function createExpertSubsection() {
  const subsection = $state({ items: 0, hidden: 0 });
  setContext(SUB_KEY, subsection);
  return subsection;
}

export function getExpertSubsection() {
  return getContext(SUB_KEY);
}
