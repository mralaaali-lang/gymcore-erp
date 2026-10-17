/**
 * geminiAdapter.ts — Gemini AI integration for AI Analytics [NEW - 2026]
 *
 * Replaces the old OpenAI adapter. Provides churn analysis, plan recommendations,
 * and revenue insights using Google's Gemini API.
 *
 * Usage: Set GEMINI_API_KEY in environment to enable.
 * When disabled, the rule-based fallback in aiAnalytics.service.ts is used automatically.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Check if Gemini integration is available
 */
export function isGeminiAvailable(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 0;
}

/**
 * Make a request to Gemini API
 */
async function callGemini(prompt: string, systemPrompt?: string): Promise<string | null> {
  if (!isGeminiAvailable()) return null;

  try {
    const contents: any[] = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await fetch(
      `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const responseData = (await response.json()) as GeminiResponse;
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (error) {
    console.error('Gemini API call failed:', error);
    return null;
  }
}

/**
 * Generate a natural-language churn analysis for a gym using Gemini
 */
export async function generateChurnAnalysis(params: {
  gym_name: string;
  churn_score: number;
  risk_level: string;
  factors: string[];
  recent_activity: {
    checkins_30d: number;
    checkins_prev_30d: number;
    overdue_invoices: number;
    open_tickets: number;
    failed_payments: number;
  };
}): Promise<{
  analysis: string;
  recommendations: string[];
  suggested_discount?: number;
} | null> {
  if (!isGeminiAvailable()) return null;

  const prompt = `Analyze this gym's churn risk data and provide actionable recommendations in Arabic.

Gym: ${params.gym_name}
Churn Score: ${params.churn_score}/100
Risk Level: ${params.risk_level}
Factors: ${params.factors.join(', ')}

Recent Activity:
- Check-ins (last 30 days): ${params.recent_activity.checkins_30d}
- Check-ins (previous 30 days): ${params.recent_activity.checkins_prev_30d}
- Overdue Invoices: ${params.recent_activity.overdue_invoices}
- Open Support Tickets: ${params.recent_activity.open_tickets}
- Failed Payments: ${params.recent_activity.failed_payments}

Provide: 1) Brief Arabic analysis (2-3 sentences), 2) 3-5 specific recommendations in Arabic, 3) Suggested discount percentage if applicable (0-50).

Format as JSON:
{
  "analysis": "...",
  "recommendations": ["...", "..."],
  "suggested_discount": number or null
}`;

  const result = await callGemini(
    prompt,
    'You are a gym business analytics expert. Always respond in JSON format only.'
  );

  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * §61 — سطر الباقات في الـprompt يتبني من الكتالوج الحي، مش من نص ثابت:
 * الأسماء القديمة (Starter/Professional/Enterprise) اتسحبت من `billing_plans`
 * في migration 079 وحلت مكانها Basic/Advanced/Complete، و«Professional» ما
 * كانش اسم موجود أصلًا. المنادي يمرّ `plans` من `getActivePlanCatalog()`.
 */
export interface PlanCatalogEntry {
  name: string;
  max_members: number;
  max_staff: number;
}

/**
 * Generate a natural-language plan recommendation using Gemini
 */
export async function generatePlanRecommendation(params: {
  gym_name: string;
  current_plan: string;
  usage_intensity: string;
  payment_rate: number;
  member_count: number;
  staff_count: number;
  plans: PlanCatalogEntry[];
}): Promise<{
  recommendation: string;
  confidence: number;
  reasoning: string;
} | null> {
  if (!isGeminiAvailable()) return null;
  if (params.plans.length === 0) return null;

  const limit = (n: number) => (n < 0 ? 'unlimited' : String(n));
  const available = params.plans
    .map((p) => `${p.name} (up to ${limit(p.max_members)} members, ${limit(p.max_staff)} staff)`)
    .join(', ');

  const prompt = `Based on the following gym data, recommend the best billing plan:

Gym: ${params.gym_name}
Current Plan: ${params.current_plan}
Usage Intensity: ${params.usage_intensity}
Payment Rate: ${(params.payment_rate * 100).toFixed(0)}%
Members: ${params.member_count}
Staff: ${params.staff_count}

Available plans: ${available}

Respond in JSON:
{
  "recommendation": "${params.plans.map((p) => p.name).join(' | ')}",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation in Arabic"
}`;

  const result = await callGemini(
    prompt,
    'You are a gym plan recommendation expert. Respond in JSON only.'
  );

  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Generate a revenue forecast summary with natural-language insights
 */
export async function generateRevenueInsights(params: {
  gym_name: string;
  historical: { month: string; revenue: number }[];
  forecast: { month: string; predicted: number }[];
  total_revenue: number;
  growth_rate: number;
}): Promise<{
  summary: string;
  key_insights: string[];
  risk_factors: string[];
} | null> {
  if (!isGeminiAvailable()) return null;

  const prompt = `Analyze this gym's revenue data and provide insights:

Gym: ${params.gym_name}
Total Revenue (12mo): ${params.total_revenue} EGP
Growth Rate: ${(params.growth_rate * 100).toFixed(1)}%
Historical Months: ${params.historical.length}
Forecast Months: ${params.forecast.length}

Respond in JSON:
{
  "summary": "Arabic summary (2-3 sentences)",
  "key_insights": ["insight1", "insight2", "insight3"],
  "risk_factors": ["risk1", "risk2"]
}`;

  const result = await callGemini(
    prompt,
    'You are a financial analytics expert. Respond in JSON only.'
  );

  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}
