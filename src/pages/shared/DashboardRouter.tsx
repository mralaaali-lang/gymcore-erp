import { lazy, Suspense } from 'react';
import Spinner from '../../components/ui/Spinner';
import { useApp } from '../../context/GymBrandContext';

const SuperAdminDashboard = lazy(() => import('../dashboards/SuperAdminDashboard'));
const GymAdminDashboard = lazy(() => import('../dashboards/GymAdminDashboard'));
const TrainerDashboard = lazy(() => import('../dashboards/TrainerDashboard'));
const PlayerDashboard = lazy(() => import('../dashboards/PlayerDashboard'));
const ReceptionDashboard = lazy(() => import('../dashboards/ReceptionDashboard'));

const loader = (
  <div className="flex justify-center py-12">
    <Spinner />
  </div>
);

const dashboards: Record<string, () => JSX.Element> = {
  'super-admin': () => <Suspense fallback={loader}><SuperAdminDashboard /></Suspense>,
  'gym-admin': () => <Suspense fallback={loader}><GymAdminDashboard /></Suspense>,
  'trainer': () => <Suspense fallback={loader}><TrainerDashboard /></Suspense>,
  'reception': () => <Suspense fallback={loader}><ReceptionDashboard /></Suspense>,
  'player': () => <Suspense fallback={loader}><PlayerDashboard /></Suspense>,
};

export default function DashboardRouter() {
  const { role } = useApp();
  const Dashboard = dashboards[role];

  if (!Dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
        <span className="material-symbols-outlined text-5xl mb-4">error</span>
        <p className="text-body-lg">ليس لديك صلاحية للوحة التحكم</p>
      </div>
    );
  }

  return <Dashboard />;
}
