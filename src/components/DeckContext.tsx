"use client";

import { createContext, useContext } from "react";

export type DeckContextValue = { deckId: string | null; themeStyle?: React.CSSProperties };

export const DeckContext = createContext<DeckContextValue>({ deckId: null });
export const useDeckContext = () => useContext(DeckContext);
