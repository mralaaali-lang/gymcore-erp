import { Request, Response } from 'express';
import { aiCoach } from '../services/aiCoach';
import logger from '../config/logger';

export async function getMemberInsights(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const insights = await aiCoach.getMemberInsights(gym_id!, member_id);
    if (!insights) { res.status(404).json({ error: 'Member not found' }); return; }
    const recommendations = await aiCoach.generateWorkoutRecommendation(gym_id!, member_id);
    const goals = await aiCoach.getGoalsForMember(gym_id!, member_id);
    res.status(200).json({ data: { ...insights, recommendations, goals } });
  } catch (error) {
    logger.error('AI coach insights failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function predictChurn(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const predictions = await aiCoach.predictChurn(gym_id!);
    res.status(200).json({ data: predictions });
  } catch (error) {
    logger.error('Churn prediction failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWorkoutRecommendation(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const recommendations = await aiCoach.generateWorkoutRecommendation(gym_id!, member_id);
    res.status(200).json({ data: recommendations });
  } catch (error) {
    logger.error('Workout recommendation failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
