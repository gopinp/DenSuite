"use client";

import { createContext, useContext } from "react";

export type PracticeSummary = {
  id: string;
  name: string;
};

export type PracticeContextValue = {
  practices: PracticeSummary[];
  selectedPracticeId: string;
  selectedPractice: PracticeSummary | null;
  setSelectedPracticeId: (practiceId: string) => void;
  practicesLoading: boolean;
  practicesError: string;
  canSelectPractice: boolean;
};

const PracticeContext = createContext<PracticeContextValue | null>(null);

export const PracticeContextProvider = PracticeContext.Provider;

export function usePracticeContext() {
  const context = useContext(PracticeContext);
  if (!context) {
    throw new Error("usePracticeContext must be used within PracticeContextProvider.");
  }
  return context;
}
