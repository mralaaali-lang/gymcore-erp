import { useNavigate } from 'react-router-dom';
import { IdentificationBadge, ShieldCheck, UserCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import PhoneCodeLoginScreen, { PortalLink } from '../../components/auth/PhoneCodeLoginScreen';
import { staffLoginByCode } from '../../services/api';
import { ROLE_MAP } from '../../types';

const STAFF_ROLE_ROUTE: Record<string, string> = {
  trainer: '/trainer/dashboard',
  reception: '/reception/dashboard',
};

/**
 * /team-login — the staff portal (reception + trainers).
 *
 * Used to be a merged screen that guessed the credential space from what you
 * typed: a phone hit the member PIN endpoint, an email hit the staff password
 * endpoint. Now the portal is explicit and everyone who works here signs in the
 * same way — phone number + the 4-digit code the manager issued from the
 * dashboard (083_staff_login_code.sql).
 *
 * Managers keep email + password on /login: the backend refuses a code login
 * for a manager account, and this screen would have nowhere sensible to send
 * one anyway.
 */
export default function StaffLoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (phone: string, code: string) => {
    const data = await staffLoginByCode(phone, code);
    const backendRole = data.user?.role || '';

    if (backendRole === 'manager') {
      // Should be unreachable (the backend answers 403 for these), but if a
      // manager account ever slips through, never land it on a staff console.
      throw Object.assign(new Error('manager'), {
        response: { data: { error: 'MANAGER_ACCOUNT' } },
      });
    }

    const mappedRole = ROLE_MAP[backendRole] || 'trainer';
    login(mappedRole, data.user?.gym_id || '');
    showToast(t('staff.signedIn'), 'success');
    navigate(STAFF_ROLE_ROUTE[mappedRole] || '/trainer/dashboard');
  };

  return (
    <PhoneCodeLoginScreen
      area="staff"
      title={t('auth.staffPortalTitle')}
      tagline={t('staff.staffPortalTagline')}
      pwaAppName={t('auth.staffPortalTitle')}
      rememberKey="team_phone"
      brandFallback={<IdentificationBadge size={30} strokeWidth={1.5} className="text-auth-accent" />}
      onSubmit={handleSubmit}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PortalLink
            to="/player-login"
            icon={<UserCircle size={14} className="transition-colors group-hover:text-auth-accent" />}
            label={t('auth.playerLinkFromStaff')}
          />
          <PortalLink
            to="/login"
            icon={<ShieldCheck size={14} className="transition-colors group-hover:text-auth-accent" />}
            label={t('auth.adminLinkFromTeam')}
          />
        </div>
      }
    />
  );
}
