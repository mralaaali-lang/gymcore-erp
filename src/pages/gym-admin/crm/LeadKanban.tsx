import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { listLeads, createLead, updateLead, deleteLead, type LeadData } from '../../../services/api';
import LeadCard from './LeadCard';
import LeadForm from './LeadForm';
import FilterBar from '../../../components/shared/FilterBar';
import PageLoader from '../../../components/shared/PageLoader';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { Plus } from '@phosphor-icons/react';

const COLUMNS = ['new', 'contacted', 'trial_booked', 'converted', 'lost'];

const columnLabels: Record<string, string> = {
  new: 'جديد',
  contacted: 'تم الاتصال',
  trial_booked: 'حجز تجربة',
  converted: 'محول',
  lost: 'خاسر',
};

const columnDots: Record<string, string> = {
  new: 'bg-emerald-500',
  contacted: 'bg-blue-500',
  trial_booked: 'bg-purple-500',
  converted: 'bg-emerald-500',
  lost: 'bg-red-400',
};

export default function LeadKanban() {
  const { language } = useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadData | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: () => listLeads({ limit: 200 }),
    staleTime: 30_000,
  });

  const leads = data?.data || [];

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LeadData> }) => updateLead(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowForm(false);
      setEditingLead(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) => l.name.toLowerCase().includes(q) || l.phone.includes(q)
    );
  }, [leads, search]);

  const grouped = useMemo(() => {
    const map: Record<string, LeadData[]> = {};
    COLUMNS.forEach((c) => { map[c] = []; });
    filteredLeads.forEach((l) => {
      if (map[l.status]) map[l.status].push(l);
    });
    return map;
  }, [filteredLeads]);



  const handleStatusChange = (id: string, status: string) => {
    updateMutation.mutate({ id, data: { status } });
  };

  const handleEdit = (lead: LeadData) => {
    setEditingLead(lead);
    setShowForm(true);
  };

  const handleFormSubmit = (formData: Omit<LeadData, 'id' | 'status'>) => {
    if (editingLead) {
      updateMutation.mutate({ id: editingLead.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleAddNew = () => {
    setEditingLead(null);
    setShowForm(true);
  };

  if (isLoading) {
    return <PageLoader message={language === 'ar' ? 'جاري التحميل...' : 'Loading...'} />;
  }

  if (error) {
    return (
      <Card className="text-center text-sm text-red-500">
        {language === 'ar' ? 'فشل تحميل العملاء المحتملين' : 'Failed to load leads'}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={language === 'ar' ? 'بحث بالاسم أو الجوال...' : 'Search name or phone...'}
        />
        <Button variant="primary" onClick={handleAddNew}>
          <Plus size={16} />
          {language === 'ar' ? 'إضافة عميل' : 'Add Lead'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {COLUMNS.map((col) => (
          <div key={col} className="bg-gray-50 rounded-3xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="flex items-center gap-2 font-bold text-sm text-gray-900">
                <span className={`w-2 h-2 rounded-full ${columnDots[col]}`} />
                {columnLabels[col]}
              </h3>
              <span className="text-xs font-bold bg-white px-2.5 py-1 rounded-full border border-gray-100 text-gray-500 shadow-sm">
                {grouped[col].length}
              </span>
            </div>
            <div className="space-y-3 min-h-[120px]">
              {grouped[col].map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onStatusChange={handleStatusChange}
                  onEdit={handleEdit}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
              {grouped[col].length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">
                  {language === 'ar' ? 'لا يوجد' : 'No leads'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <LeadForm
          lead={editingLead}
          onSubmit={handleFormSubmit}
          onCancel={() => { setShowForm(false); setEditingLead(null); }}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}
