import { create } from "zustand";

export type Tab = "flow" | "load" | "ratelimit" | "cost" | "security" | "compliance" | "reliability" | "optimise" | "deployment";

interface VizState {
  /** the repository analysis, or the practice pack — two different subjects */
  activeView: "repo" | "research";
  setActiveView: (v: "repo" | "research") => void;

  activeService: string;
  setActiveService: (s: string) => void;

  activeTab: Tab;
  setActiveTab: (t: Tab) => void;

  selectedStep: string | null;
  setSelectedStep: (s: string | null) => void;

  selectedFinding: string | null;
  setSelectedFinding: (s: string | null) => void;

  /** reliability lens: assumed success rate of a single external call */
  perCallSuccess: number;
  setPerCallSuccess: (n: number) => void;
  /** reliability lens: units driving a service's fan-out */
  fanOutUnits: number;
  setFanOutUnits: (n: number) => void;
}

export const useVizStore = create<VizState>((set) => ({
  activeView: "repo",
  setActiveView: (v) => set({ activeView: v }),

  activeService: "overall",
  setActiveService: (s) =>
    set({ activeService: s, activeView: "repo", selectedFinding: null, selectedStep: null, activeTab: "flow" }),

  activeTab: "flow",
  setActiveTab: (t) => set({ activeTab: t, selectedFinding: null }),

  selectedStep: null,
  setSelectedStep: (s) => set({ selectedStep: s }),

  selectedFinding: null,
  setSelectedFinding: (s) => set({ selectedFinding: s }),

  perCallSuccess: 99.5,
  setPerCallSuccess: (n) => set({ perCallSuccess: n }),
  fanOutUnits: 50,
  setFanOutUnits: (n) => set({ fanOutUnits: n }),
}));
