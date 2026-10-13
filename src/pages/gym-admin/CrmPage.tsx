import { useApp } from '../../context/GymBrandContext';
import LeadKanban from './crm/LeadKanban';

export default function CrmPage() {
  const { language } = useApp();
  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}
      <LeadKanban />
    </div>
  );
}
