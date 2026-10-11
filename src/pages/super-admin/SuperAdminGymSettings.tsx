// ── Super Admin Gym Settings Wrapper ──
// Loads the same 11-tab SettingsPage but for a specific gym (by :id in URL)
import { useParams } from 'react-router-dom';
import { SettingsGymProvider } from '../../context/SettingsGymContext';
import SettingsPage from '../settings/SettingsPage';

export default function SuperAdminGymSettings() {
  const { id } = useParams<{ id: string }>();

  return (
    <SettingsGymProvider value={{ gymId: id }}>
      <SettingsPage />
    </SettingsGymProvider>
  );
}
