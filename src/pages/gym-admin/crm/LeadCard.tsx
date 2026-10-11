import { useApp } from '../../../context/GymBrandContext';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  notes?: string;
  assigned_to?: string;
}

interface LeadCardProps {
  lead: Lead;
  onStatusChange: (id: string, status: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete?: (id: string) => void;
}

const sourceColors: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-800 border-blue-200',
  instagram: 'bg-pink-100 text-pink-800 border-pink-200',
  walk_in: 'bg-green-100 text-green-800 border-green-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

const sourceLabels: Record<string, string> = {
  facebook: 'فيسبوك',
  instagram: 'انستغرام',
  walk_in: 'زيارة',
  other: 'أخرى',
};

export default function LeadCard({ lead, onStatusChange, onEdit, onDelete }: LeadCardProps) {
  const { language } = useApp();

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">{lead.name}</h3>
          <p className="text-sm text-gray-500 ltr:text-left rtl:text-right">{lead.phone}</p>
          {lead.email && (
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{lead.email}</p>
          )}
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${sourceColors[lead.source] || sourceColors.other}`}>
          {sourceLabels[lead.source] || lead.source}
        </span>
      </div>

      {lead.assigned_to && (
        <p className="text-xs text-gray-400">
          {language === 'ar' ? 'مسؤول:' : 'Assigned to:'} {lead.assigned_to}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
        {lead.status !== 'contacted' && (
          <button
            onClick={() => onStatusChange(lead.id, 'contacted')}
            className="px-2.5 py-1 text-xs font-medium rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            {language === 'ar' ? 'اتصال' : 'Contact'}
          </button>
        )}
        {lead.status !== 'trial_booked' && lead.status !== 'converted' && lead.status !== 'lost' && (
          <button
            onClick={() => onStatusChange(lead.id, 'trial_booked')}
            className="px-2.5 py-1 text-xs font-medium rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
          >
            {language === 'ar' ? 'حجز تجربة' : 'Book Trial'}
          </button>
        )}
        {lead.status !== 'converted' && lead.status !== 'lost' && (
          <button
            onClick={() => onStatusChange(lead.id, 'converted')}
            className="px-2.5 py-1 text-xs font-medium rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            {language === 'ar' ? 'تحويل' : 'Convert'}
          </button>
        )}
        {lead.status !== 'lost' && (
          <button
            onClick={() => onStatusChange(lead.id, 'lost')}
            className="px-2.5 py-1 text-xs font-medium rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            {language === 'ar' ? 'خسارة' : 'Lost'}
          </button>
        )}
        <button
          onClick={() => onEdit(lead)}
          className="px-2.5 py-1 text-xs font-medium rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          {language === 'ar' ? 'تعديل' : 'Edit'}
        </button>
        {lead.status !== 'converted' && onDelete && (
          <button
            onClick={() => onDelete(lead.id)}
            className="px-2.5 py-1 text-xs font-medium rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            {language === 'ar' ? 'حذف' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}
