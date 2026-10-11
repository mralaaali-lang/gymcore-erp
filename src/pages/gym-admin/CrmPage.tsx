import { useApp } from '../../context/GymBrandContext';
import PageHeader from '../../components/shared/PageHeader';
import LeadKanban from './crm/LeadKanban';

export default function CrmPage() {
  const { language } = useApp();
  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title={language === 'ar' ? 'إدارة العملاء المحتملين' : 'CRM Lead Management'}
        subtitle={language === 'ar' ? 'تابع العملاء المحتملين عبر مراحل البيع' : 'Track leads across the sales pipeline'}
        icon="group"
      />
      <LeadKanban />
    </div>
  );
}
