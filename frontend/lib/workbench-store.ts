// The few values every panel shares (Foundation Fixes fix 3): the selected
// investigation. Server data does not go here -- it lives in TanStack Query.
import {create} from 'zustand';

type WorkbenchState = {
  investigationId: string;
  setInvestigationId: (id: string) => void;
};

export const useWorkbenchStore = create<WorkbenchState>(set => ({
  investigationId: '',
  setInvestigationId: id => set({investigationId: id}),
}));
