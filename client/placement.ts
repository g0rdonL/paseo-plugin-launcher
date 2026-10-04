import type { Placement } from "../shared/launcher";

// Lets the settings screen re-apply placement right after a save, without waiting for a
// plugin reload. index.client.tsx installs the applier; the screen calls it.
let applier: ((placement: Placement) => void) | null = null;

export function setPlacementApplier(next: ((placement: Placement) => void) | null): void {
  applier = next;
}

export function applyPlacement(placement: Placement): void {
  applier?.(placement);
}
