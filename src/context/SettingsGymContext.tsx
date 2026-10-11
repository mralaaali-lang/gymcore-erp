import { createContext, useContext } from 'react';

interface SettingsGymContextValue {
  gymId: string | undefined;
}

const SettingsGymContext = createContext<SettingsGymContextValue>({ gymId: undefined });

export const SettingsGymProvider = SettingsGymContext.Provider;
export const useSettingsGym = () => useContext(SettingsGymContext);
