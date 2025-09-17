import React, { createContext, useContext, useState } from 'react';

export type Plant = {
  phase: number;
  variant: string;
  asset_filename: string;
  last_updated?: string;
} | null;

type PlantContextType = {
  plant: Plant;
  setPlant: (p: Plant) => void;
};

const PlantContext = createContext<PlantContextType>({
  plant: null,
  setPlant: () => {},
});

export const PlantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plant, setPlant] = useState<Plant>(null);
  return (
    <PlantContext.Provider value={{ plant, setPlant }}>
      {children}
    </PlantContext.Provider>
  );
};

export const usePlant = () => useContext(PlantContext);
