import { useNavigate } from 'react-router-dom';
import { Users, ShieldCheck } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import PhoneCodeLoginScreen, { PortalLink } from '../../components/auth/PhoneCodeLoginScreen';
import { memberLogin as apiMemberLogin } from '../../services/api';

/**
 * /player-login — the member portal.
 *
 * Members sign in with their phone number and the 4-digit code the gym issued
 * (members.pin_code_hash, phone + code self-login). Email and password never
 * applied to members: the old merged portal hit the *staff* endpoint when the
 * identifier looked like an email, so a member typing one got a confusing
 * "invalid credentials" from a credential space they were never part of.
 *
 * A code that was lost — or never issued, which is most of the member table —
 * is recovered right here with "نسيت الكود؟", which issues a new one and sends
 * it on WhatsApp (or the front desk resets it from the member file).
 */
export default function PlayerLoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (phone: string, code: string) => {
    const data = await apiMemberLogin(phone, code, 'member');
    login('player', data.member?.gym_id || '');
    showToast(t('staff.memberLoginSuccess'), 'success');
    navigate('/player/dashboard');
  };

  return (
    <PhoneCodeLoginScreen
      area="member"
      title={t('auth.playerPortalTitle')}
      tagline={t('staff.playerPortalTagline')}
      pwaAppName={t('auth.playerPortalTitle')}
      rememberKey="player_phone"
      brandFallback={<Users size={30} strokeWidth={1.5} className="text-auth-accent" />}
      onSubmit={handleSubmit}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PortalLink
            to="/team-login"
            icon={<Users size={14} className="transition-colors group-hover:text-auth-accent" />}
            label={t('auth.staffLinkFromPlayer')}
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
