import { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import * as api from '../services/api';

// Types (موجودة بالفعل في API ولكن مُعرّفة هنا للملاءمة)
export interface TrainerProgressLog {
  id?: string;
  trainerId: string;
  gymId: string;
  date: string; // ISO string
  clientCount: number;
  sessionCount: number;
  durationMinutes: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainerProgressState {
  today: TrainerProgressLog | null;
  history: TrainerProgressLog[];
  loading: boolean;
  error: string | null;
  addProgress: (data: Partial<TrainerProgressLog>) => Promise<void>;
  updateProgress: (id: string, data: Partial<TrainerProgressLog>) => Promise<void>;
  deleteProgress: (id: string) => Promise<void>;
}

const TrainerProgressContext = createContext<TrainerProgressState | undefined>(undefined);

// Fetch today's progress (سجل لليوم)
async function fetchTodayProgress(trainerId: string, gymId: string): Promise<TrainerProgressLog> {
  const res = await api.getTrainerProgressToday(trainerId, gymId);
  return res.data;
}

// Fetch history (last 30 يوم)
async function fetchHistory(trainerId: string, gymId: string): Promise<TrainerProgressLog[]> {
  const res = await api.getTrainerProgressHistory(trainerId, gymId);
  return res.data;
}

export function TrainerProgressProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  // Trainer ID comes from auth role context; gymId from tenantId
  const trainerId = auth.tenantId; // placeholder — replace with actual trainer ID when available
  const gymId = auth.tenantId;

  const [error, setError] = useState<string | null>(null);

  // Today's progress query
  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['trainerProgress', 'today', trainerId],
    queryFn: () => fetchTodayProgress(trainerId, gymId),
    enabled: !!trainerId,
    staleTime: 5 * 60 * 1000, // 5 دقائق
  });

  // History query
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['trainerProgress', 'history', trainerId],
    queryFn: () => fetchHistory(trainerId, gymId),
    enabled: !!trainerId,
    staleTime: 10 * 60 * 1000, // 10 دقائق
  });

  // Add progress mutation
  const addProgressMutation = useMutation({
    mutationFn: (progress: Partial<TrainerProgressLog>) => api.createTrainerProgress(progress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainerProgress'] });
    },
    onError: (err) => setError(err.message),
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TrainerProgressLog> }) => api.updateTrainerProgress(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainerProgress'] });
    },
    onError: (err) => setError(err.message),
  });

  // Delete progress mutation
  const deleteProgressMutation = useMutation({
    mutationFn: (id: string) => api.deleteTrainerProgress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainerProgress'] });
    },
    onError: (err) => setError(err.message),
  });

  const addProgress = useCallback(async (data: Partial<TrainerProgressLog>) => {
    await addProgressMutation.mutateAsync(data);
  }, [addProgressMutation]);

  const updateProgress = useCallback(async (id: string, data: Partial<TrainerProgressLog>) => {
    await updateProgressMutation.mutateAsync({ id, data });
  }, [updateProgressMutation]);

  const deleteProgress = useCallback(async (id: string) => {
    await deleteProgressMutation.mutateAsync(id);
  }, [deleteProgressMutation]);

  const value: TrainerProgressState = {
    today: todayData ?? null,
    history: historyData ?? [],
    loading: todayLoading || historyLoading,
    error,
    addProgress,
    updateProgress,
    deleteProgress,
  };

  return (
    <TrainerProgressContext.Provider value={value}>
      {children}
    </TrainerProgressContext.Provider>
  );
}

export function useTrainerProgress() {
  const context = useContext(TrainerProgressContext);
  if (!context) {
    throw new Error('useTrainerProgress must be used within TrainerProgressProvider');
  }
  return context;
}