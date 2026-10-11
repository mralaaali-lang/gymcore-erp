import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { predictChurn, recommendPlans, forecastRevenue, generateSuggestions } from '../services/aiAnalytics.service';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// AI ANALYTICS — Churn Prediction
// ====================================================================
export const getChurnPrediction = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await predictChurn(90);
    res.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('getChurnPrediction failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// AI ANALYTICS — Plan Recommendations
// ====================================================================
export const getPlanRecommendations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await recommendPlans();
    res.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('getPlanRecommendations failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// AI ANALYTICS — Revenue Forecast
// ====================================================================
export const getRevenueForecast = async (req: Request, res: Response): Promise<void> => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months as string) || 3, 1), 12);
    const data = await forecastRevenue(months);
    res.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('getRevenueForecast failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// AI ANALYTICS — Suggestions
// ====================================================================
export const getAISuggestions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await generateSuggestions();
    res.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('getAISuggestions failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// AI ANALYTICS — Dashboard Summary (all in one)
// ====================================================================
export const getAIDashboard = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [churn, plans, forecast, suggestions] = await Promise.all([
      predictChurn(90),
      recommendPlans(),
      forecastRevenue(3),
      generateSuggestions(),
    ]);
    const client = await getAdminClient();
    const statsResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE churn_score >= 70)::int AS high_risk_count,
        COUNT(*) FILTER (WHERE churn_score >= 40 AND churn_score < 70)::int AS medium_risk_count,
        ROUND(AVG(churn_score), 1)::numeric(4,1) AS avg_risk_score
      FROM (
        SELECT g.id, COALESCE(
          (SELECT COUNT(*) FROM billing_invoices WHERE gym_id = g.id AND status = 'overdue') * 30 +
          (SELECT COUNT(*) FROM support_tickets WHERE gym_id = g.id AND status IN ('open','in_progress')) * 25, 0
        ) AS churn_score
        FROM gyms g WHERE g.is_active = true
      ) sub
    `);
    await client.query('COMMIT');
    client.release();

    res.json({
      data: {
        churn_prediction: churn,
        plan_recommendations: plans,
        revenue_forecast: forecast,
        suggestions,
        stats: statsResult.rows[0] || { high_risk_count: 0, medium_risk_count: 0, avg_risk_score: 0 },
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('getAIDashboard failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
