import { createContext, useContext } from 'react';

/**
 * Lets a drawing surface (e.g. SignaturePad) temporarily freeze the enclosing
 * ScrollView so a drag draws instead of scrolls. Defaults to no-ops when there
 * is no provider, so the pad is safe to use anywhere.
 */
export const ScrollLockContext = createContext<{ lock: () => void; unlock: () => void }>({
  lock: () => {},
  unlock: () => {},
});

export const useScrollLock = () => useContext(ScrollLockContext);
