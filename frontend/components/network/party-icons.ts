// The icon in a party's dot, by kind (Lucide, ISC licence; the set the
// app's buttons use). A record of no listed kind gets none: no icon claims
// more than the record says. Kept apart from the drawing so the panel's key
// can use it without loading React Flow.
import {Building, House, Landmark, Ship, User} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

import type {PartyKind} from '@/lib/viz-tokens';

export const KIND_ICON: Record<PartyKind, LucideIcon | null> = {
  person: User, company: Building, organisation: Landmark, vehicle: Ship, property: House, other: null,
};
