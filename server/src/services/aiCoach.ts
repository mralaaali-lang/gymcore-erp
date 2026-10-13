import { query } from '../config/database';
import logger from '../config/logger';
import knex from '../config/knex';

interface MemberInsight {
  memberId: string;
  memberName: string;
  attendanceRate: number;
  churnRisk: 'low' | 'medium' | 'high';
  recommendation: string;
  weeklyGoal?: string;
}

interface ChurnPrediction {
  memberId: string;
  probability: number;
  riskLevel: 'low' | 'medium' | 'high';
  mainFactor: string;
  suggestedAction: string;
}

class AICoachService {
  async getMemberInsights(gymId: string, memberId: string): Promise<MemberInsight | null> {
    try {
      const subResult = await query(
        `SELECT m.id, m.full_name, decrypt_sensitive(m.notes_encrypted) AS medical_notes,
                (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins_30d,
                (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '7 days') AS checkins_7d,
                (SELECT status FROM member_subscriptions WHERE member_id = m.id AND gym_id = m.gym_id ORDER BY created_at DESC LIMIT 1) AS sub_status
         FROM members m WHERE m.id = $1 AND m.gym_id = $2`,
        [memberId, gymId]
      );
      if (subResult.rows.length === 0) return null;
      const row = subResult.rows[0];
      const checkins30d = parseInt(row.checkins_30d) || 0;
      const checkins7d = parseInt(row.checkins_7d) || 0;
      const attendanceRate = Math.min(Math.round((checkins30d / 30) * 100), 100);
      let churnRisk: 'low' | 'medium' | 'high' = 'low';
      let recommendation = '';
      if (attendanceRate < 20) {
        churnRisk = 'high';
        recommendation = 'لم يحضر العضو منذ فترة طويلة. يرجى التواصل معه وتقديم عرض تحفيزي لإعادة الاشتراك أو الحضور.';
      } else if (attendanceRate < 50) {
        churnRisk = 'medium';
        recommendation = 'حضور العضو متوسط. نوصي بإرسال تذكير بجدول الحصص وتقديم خطة تدريب شخصية.';
      } else {
        recommendation = 'أداء ممتاز! العضو منتظم في الحضور. نوصي بتقديم برنامج متقدم لتحدي جديد.';
      }
      const weeklyGoal = checkins7d >= 3 ? 'هدف الأسبوع: حافظ على انتظامك' : 'هدف الأسبوع: حاول الحضور 3 مرات على الأقل';
      return {
        memberId: row.id, memberName: row.full_name, attendanceRate, churnRisk, recommendation, weeklyGoal,
      };
    } catch (error) {
      logger.error('AI Coach insights failed', { error: (error as Error).message });
      return null;
    }
  }

  async predictChurn(gymId: string): Promise<ChurnPrediction[]> {
    try {
      const result = await query(`
        SELECT m.id, m.full_name,
               (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins_30d,
               (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '60 days') AS checkins_60d,
               (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '90 days') AS checkins_90d,
               (SELECT status FROM member_subscriptions WHERE member_id = m.id AND gym_id = m.gym_id ORDER BY created_at DESC LIMIT 1) AS sub_status
        FROM members m WHERE m.gym_id = $1
        ORDER BY checkins_30d ASC
        LIMIT 20
      `, [gymId]);
      return result.rows.map((row: any) => {
        const c30 = parseInt(row.checkins_30d) || 0;
        const c60 = parseInt(row.checkins_60d) || 1;
        const c90 = parseInt(row.checkins_90d) || 1;
        const decline = c60 > 0 ? (c60 - c30) / c60 : 0;
        const probability = Math.min(Math.round((1 - c30 / 30 + decline * 0.5) * 100), 100);
        let riskLevel: 'low' | 'medium' | 'high';
        let mainFactor: string;
        let suggestedAction = '';
        if (probability > 60) {
          riskLevel = 'high'; mainFactor = 'انخفاض حاد في الحضور';
          suggestedAction = 'اتصل بالعضو فوراً، قدم عرض تمديد مجاني أو استشارة مع مدرب شخصي.';
        } else if (probability > 30) {
          riskLevel = 'medium'; mainFactor = 'تراجع ملحوظ في التردد على النادي';
          suggestedAction = 'أرسل رسالة تذكير بجدول الحصص المميزة وعرض خصم للتجديد المبكر.';
        } else {
          riskLevel = 'low'; mainFactor = 'مستقر';
          suggestedAction = 'حافظ على التواصل الإيجابي عبر إرسال نصائح اللياقة أسبوعياً.';
        }
        return { memberId: row.id, probability, riskLevel, mainFactor, suggestedAction };
      });
    } catch (error) {
      logger.error('Churn prediction failed', { error: (error as Error).message });
      return [];
    }
  }

  async generateWorkoutRecommendation(gymId: string, memberId: string): Promise<string[]> {
    try {
      const member = await query(
        `SELECT m.full_name, decrypt_sensitive(m.notes_encrypted) AS medical_notes,
                (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins
         FROM members m WHERE m.id = $1 AND m.gym_id = $2`,
        [memberId, gymId]
      );
      if (member.rows.length === 0) return ['عضو غير موجود'];
      const row = member.rows[0];
      const checkins = parseInt(row.checkins) || 0;
      const hasMedicalNotes = !!row.medical_notes;
      const tips: string[] = [];
      if (checkins < 5) {
        tips.push('ابدأ بتمارين خفيفة لمدة 20 دقيقة لبناء اللياقة الأساسية.');
        tips.push('جرب 3 تمارين كارديو أسبوعياً + تمارين مقاومة خفيفة.');
        tips.push('اشرب 2 لتر ماء يومياً ولا تنسَ الإحماء قبل التمرين.');
      } else if (checkins < 15) {
        tips.push('حافظ على 4 تمارين أسبوعياً + زيادة تدريجية في الأوزان.');
        tips.push('جرب تمارين HIIT 15 دقيقة بعد الكارديو لحرق دهون أسرع.');
        tips.push('نوم 7-8 ساعات ضروري لتعافي العضلات.');
      } else {
        tips.push('مستوى متقدم! جرب تمارين السوبرست والـ Drop Sets.');
        tips.push('تنويع التمارين كل 4 أسابيع لتجنب الثبات.');
        tips.push('احسب السعرات الحرارية بناءً على هدفك (زيادة عضل / تخفيف وزن).');
      }
      if (hasMedicalNotes) {
        tips.push('لديك ملاحظات طبية مسجلة. استشر المدرب قبل بدء أي تمرين جديد.');
      }
      return tips;
    } catch (error) {
      logger.error('Workout recommendation failed', { error: (error as Error).message });
      return ['تعذر إنشاء التوصيات حالياً'];
    }
  }

  async getGoalsForMember(gymId: string, memberId: string): Promise<string[]> {
    const goals = [
      'حضور 4 أيام في الأسبوع',
      'زيادة الأحمال بنسبة 10% كل أسبوعين',
      'شرب 2.5 لتر ماء يومياً',
      'نوم 7-8 ساعات',
    ];
    return goals;
  }
}

export const aiCoach = new AICoachService();
