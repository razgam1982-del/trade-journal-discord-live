"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the current viewer may edit. Driven by the server's isEditor() check
// (the EDIT_SECRET cookie) and provided once at the page root. Editable widgets
// read it and fall back to a static, read-only display when false.
const EditModeContext = createContext(false);

export function EditModeProvider({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return <EditModeContext.Provider value={canEdit}>{children}</EditModeContext.Provider>;
}

export function useCanEdit(): boolean {
  return useContext(EditModeContext);
}
