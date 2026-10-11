-- 032: Feature Flags
-- Adds JSONB feature_flags column to platform_security_settings for server-side feature toggles

ALTER TABLE platform_security_settings ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '[
  {"key":"ai_coach","labelEn":"AI Coach Module","labelAr":"وحدة المدرب الذكي","enabled":true,"descriptionEn":"Enable AI-powered coach recommendations across all gyms","descriptionAr":"تفعيل توصيات المدرب الذكي بالذكاء الاصطناعي في جميع الصالات"},
  {"key":"zatca_e_invoicing","labelEn":"ZATCA E-Invoicing","labelAr":"الفاتورة الإلكترونية ZATCA","enabled":false,"descriptionEn":"Enable ZATCA-compliant e-invoicing for Saudi tenants","descriptionAr":"تفعيل الفوترة الإلكترونية المتوافقة مع ZATCA للصالات السعودية"},
  {"key":"loyalty_program","labelEn":"Loyalty & Rewards","labelAr":"برنامج الولاء والمكافآت","enabled":true,"descriptionEn":"Enable loyalty points & rewards system across platform","descriptionAr":"تفعيل نظام نقاط الولاء والمكافآت عبر المنصة"},
  {"key":"crm_module","labelEn":"Advanced CRM","labelAr":"إدارة علاقات العملاء المتقدمة","enabled":true,"descriptionEn":"Enable full CRM with lead tracking & marketing automation","descriptionAr":"تفعيل CRM كامل مع تتبع العملاء المحتملين وأتمتة التسويق"},
  {"key":"multi_branch","labelEn":"Multi-Branch Management","labelAr":"إدارة الفروع المتعددة","enabled":false,"descriptionEn":"Allow gyms to manage multiple branches under one account","descriptionAr":"السماح للصالات بإدارة فروع متعددة تحت حساب واحد"}
]'::jsonb;

-- Update the default row to include feature_flags
UPDATE platform_security_settings
SET feature_flags = '[
  {"key":"ai_coach","labelEn":"AI Coach Module","labelAr":"وحدة المدرب الذكي","enabled":true,"descriptionEn":"Enable AI-powered coach recommendations across all gyms","descriptionAr":"تفعيل توصيات المدرب الذكي بالذكاء الاصطناعي في جميع الصالات"},
  {"key":"zatca_e_invoicing","labelEn":"ZATCA E-Invoicing","labelAr":"الفاتورة الإلكترونية ZATCA","enabled":false,"descriptionEn":"Enable ZATCA-compliant e-invoicing for Saudi tenants","descriptionAr":"تفعيل الفوترة الإلكترونية المتوافقة مع ZATCA للصالات السعودية"},
  {"key":"loyalty_program","labelEn":"Loyalty & Rewards","labelAr":"برنامج الولاء والمكافآت","enabled":true,"descriptionEn":"Enable loyalty points & rewards system across platform","descriptionAr":"تفعيل نظام نقاط الولاء والمكافآت عبر المنصة"},
  {"key":"crm_module","labelEn":"Advanced CRM","labelAr":"إدارة علاقات العملاء المتقدمة","enabled":true,"descriptionEn":"Enable full CRM with lead tracking & marketing automation","descriptionAr":"تفعيل CRM كامل مع تتبع العملاء المحتملين وأتمتة التسويق"},
  {"key":"multi_branch","labelEn":"Multi-Branch Management","labelAr":"إدارة الفروع المتعددة","enabled":false,"descriptionEn":"Allow gyms to manage multiple branches under one account","descriptionAr":"السماح للصالات بإدارة فروع متعددة تحت حساب واحد"}
]'::jsonb
WHERE id = 1;
