import React, { createContext, useCallback, useContext, useState } from 'react';

interface NavSliderContextType {
  isOpen: boolean;
  openSlider: () => void;
  closeSlider: () => void;
  toggleSlider: () => void;
}

const NavSliderContext = createContext<NavSliderContextType | null>(null);

export function NavSliderProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSlider = useCallback(() => setIsOpen(true), []);
  const closeSlider = useCallback(() => setIsOpen(false), []);
  const toggleSlider = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <NavSliderContext.Provider
      value={{ isOpen, openSlider, closeSlider, toggleSlider }}
    >
      {children}
    </NavSliderContext.Provider>
  );
}

export function useNavSlider(): NavSliderContextType {
  const ctx = useContext(NavSliderContext);
  if (!ctx) {
    throw new Error('useNavSlider must be used within NavSliderProvider');
  }
  return ctx;
}
