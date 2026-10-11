import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import {
  getPlatformBranding,
  updatePlatformBranding,
  uploadBrandingFile,
  type PlatformBranding,
} from '../../services/api';
import { Palette, Upload, Eye, FloppyDisk, Image, TextT, Monitor, DeviceMobile } from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';
import PageHeader from '../../components/shared/PageHeader';

const DEFAULT_BRANDING: PlatformBranding = {
  logo_url: '',
  primary_color: '#006c49',
  accent_color: '#f97316',
  sidebar_bg: '#ffffff',
  sidebar_text: '#374151',
  favicon_url: '',
  app_name: 'GymCore',
  footer_text: 'آ© 2024 GymCore. All rights reserved.',
  login_bg_image: '',
  custom_css: '',
};

export default function BrandingTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<PlatformBranding>(DEFAULT_BRANDING);
  const [activeTab, setActiveTab] = useState<'general' | 'colors' | 'preview'>('general');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [uploading, setUploading] = useState<'logo' | 'favicon' | 'login_bg' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'branding'],
    queryFn: getPlatformBranding,
  });

  useEffect(() => {
    if (data?.data) {
      setForm((prev) => ({ ...prev, ...data.data }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (branding: Partial<PlatformBranding>) => updatePlatformBranding(branding),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'branding'] });
      showToast(isRtl ? 'تم حفظ العلامة التجارية بنجاح' : 'Branding saved successfully', 'success');
    },
    onError: () => {
      showToast(isRtl ? 'فشل حفظ العلامة التجارية' : 'Failed to save branding', 'error');
    },
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const handleFileUpload = async (file: File, type: 'logo' | 'favicon' | 'login_bg') => {
    if (!file) return;
    setUploading(type);
    try {
      const res = await uploadBrandingFile(file);
      const url = res.data.url;
      if (type === 'logo') setForm((prev) => ({ ...prev, logo_url: url }));
      else if (type === 'favicon') setForm((prev) => ({ ...prev, favicon_url: url }));
      else if (type === 'login_bg') setForm((prev) => ({ ...prev, login_bg_image: url }));
      showToast(isRtl ? 'تم رفع الملف بنجاح' : 'File uploaded successfully', 'success');
    } catch {
      showToast(isRtl ? 'فشل رفع الملف' : 'Failed to upload file', 'error');
    } finally {
      setUploading(null);
    }
  };

    if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'العلامة التجارية' : 'Branding'}
        subtitle={isRtl ? 'تخصيص مظهر المنصة - الشعار، الألوان، والخلفيات' : 'Customize platform appearance - logo, colors, and backgrounds'}
        actions={
          <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50"
        >
          {updateMutation.isPending ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <FloppyDisk size={18} />}
          <span>{isRtl ? 'حفظ التغييرات' : 'Save Changes'}</span>
        </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'general'
              ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextT size={16} className="inline-block ml-1.5" />
          {isRtl ? 'عام' : 'General'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('colors')}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'colors'
              ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Palette size={16} className="inline-block ml-1.5" />
          {isRtl ? 'الألوان' : 'Colors'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'preview'
              ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Eye size={16} className="inline-block ml-1.5" />
          {isRtl ? 'معاينة حية' : 'Live Preview'}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logo Upload */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isRtl ? 'شعار المنصة' : 'Platform Logo'}
            </h3>
            <div className="flex items-center gap-4 mb-4">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="w-20 h-20 rounded-xl border border-gray-200 object-contain bg-white"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <Image size={28} />
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading === 'logo'}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm text-gray-700 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                >
                  {uploading === 'logo' ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <Upload size={16} />}
                  {isRtl ? 'رفع شعار' : 'Upload Logo'}
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  {isRtl ? 'PNG, SVG, JPG حتى 2MB' : 'PNG, SVG, JPG up to 2MB'}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'logo')}
              />
            </div>

            {/* App Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isRtl ? 'اسم التطبيق' : 'App Name'}
              </label>
              <input
                type="text"
                value={form.app_name}
                onChange={(e) => setForm((prev) => ({ ...prev, app_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* Footer Text */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isRtl ? 'نص التذييل' : 'Footer Text'}
              </label>
              <input
                type="text"
                value={form.footer_text}
                onChange={(e) => setForm((prev) => ({ ...prev, footer_text: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* Favicon & Background */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isRtl ? 'أيقونة الموقع والخلفيات' : 'Favicon & Backgrounds'}
            </h3>

            {/* Favicon */}
            <div className="flex items-center gap-4 mb-5">
              {form.favicon_url ? (
                <img
                  src={form.favicon_url}
                  alt="Favicon"
                  className="w-12 h-12 rounded-lg border border-gray-200 object-contain bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <Monitor size={20} />
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploading === 'favicon'}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm text-gray-700 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                >
                  {uploading === 'favicon' ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <Upload size={16} />}
                  {isRtl ? 'رفع أيقونة' : 'Upload Favicon'}
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  {isRtl ? 'ICO, PNG 32x32' : 'ICO, PNG 32x32'}
                </p>
              </div>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/x-icon"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'favicon')}
              />
            </div>

            {/* Login Background */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isRtl ? 'خلفية صفحة تسجيل الدخول' : 'Login Page Background'}
              </label>
              {form.login_bg_image && (
                <img
                  src={form.login_bg_image}
                  alt="Login Background"
                  className="w-full h-24 rounded-xl object-cover mb-2 border border-gray-200"
                />
              )}
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                disabled={uploading === 'login_bg'}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm text-gray-700 hover:border-emerald-300 hover:text-emerald-600 transition-all"
              >
                {uploading === 'login_bg' ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <Image size={16} />}
                {isRtl ? 'رفع صورة الخلفية' : 'Upload Background'}
              </button>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'login_bg')}
              />
            </div>

            {/* Custom CSS */}
            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isRtl ? 'CSS مخصص' : 'Custom CSS'}
              </label>
              <textarea
                value={form.custom_css}
                onChange={(e) => setForm((prev) => ({ ...prev, custom_css: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-100 rounded-xl text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="/* Custom CSS */"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'colors' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Primary Colors */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isRtl ? 'الألوان الأساسية' : 'Primary Colors'}
            </h3>

            <div className="space-y-5">
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                  <span>{isRtl ? 'اللون الأساسي' : 'Primary Color'}</span>
                  <span className="text-xs font-mono text-gray-400">{form.primary_color}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(e) => setForm((prev) => ({ ...prev, primary_color: e.target.value }))}
                    className="w-12 h-12 rounded-2xl border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={form.primary_color}
                    onChange={(e) => setForm((prev) => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-100 rounded-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                  <span>{isRtl ? 'لون التمييز' : 'Accent Color'}</span>
                  <span className="text-xs font-mono text-gray-400">{form.accent_color}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                    className="w-12 h-12 rounded-2xl border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={form.accent_color}
                    onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-100 rounded-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Colors */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isRtl ? 'ألوان الشريط الجانبي' : 'Sidebar Colors'}
            </h3>

            <div className="space-y-5">
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                  <span>{isRtl ? 'خلفية الشريط' : 'Sidebar Background'}</span>
                  <span className="text-xs font-mono text-gray-400">{form.sidebar_bg}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.sidebar_bg}
                    onChange={(e) => setForm((prev) => ({ ...prev, sidebar_bg: e.target.value }))}
                    className="w-12 h-12 rounded-2xl border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={form.sidebar_bg}
                    onChange={(e) => setForm((prev) => ({ ...prev, sidebar_bg: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-100 rounded-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                  <span>{isRtl ? 'نص الشريط' : 'Sidebar Text'}</span>
                  <span className="text-xs font-mono text-gray-400">{form.sidebar_text}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.sidebar_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, sidebar_text: e.target.value }))}
                    className="w-12 h-12 rounded-2xl border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={form.sidebar_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, sidebar_text: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-100 rounded-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              {/* Preview of sidebar colors */}
              <div
                className="mt-4 p-4 rounded-xl border"
                style={{ backgroundColor: form.sidebar_bg, borderColor: form.sidebar_bg === '#ffffff' ? '#e5e7eb' : 'transparent' }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: form.sidebar_text }}>
                  {isRtl ? 'معاينة الشريط الجانبي' : 'Sidebar Preview'}
                </p>
                <div className="space-y-1.5">
                  {[isRtl ? 'لوحة التحكم' : 'Dashboard', isRtl ? 'الصالات' : 'Gyms', isRtl ? 'التقارير' : 'Reports'].map((item) => (
                    <div
                      key={item}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: `${form.primary_color}15`,
                        color: form.primary_color,
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Current Color Palette Preview */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isRtl ? 'لوحة الألوان الحالية' : 'Current Color Palette'}
            </h3>
            <div className="flex gap-3 flex-wrap">
              {[
                { label: isRtl ? 'أساسي' : 'Primary', color: form.primary_color },
                { label: isRtl ? 'تمييز' : 'Accent', color: form.accent_color },
                { label: isRtl ? 'شريط جانبي' : 'Sidebar BG', color: form.sidebar_bg },
                { label: isRtl ? 'نص الشريط' : 'Sidebar Text', color: form.sidebar_text },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div
                    className="w-6 h-6 rounded-lg border border-gray-200"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className="text-xs font-mono text-gray-400">{item.color}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div>
          {/* Device Toggle */}
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={() => setPreviewDevice('desktop')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                previewDevice === 'desktop'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Monitor size={16} />
              {isRtl ? 'حاسوب' : 'Desktop'}
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice('mobile')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                previewDevice === 'mobile'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <DeviceMobile size={16} />
              {isRtl ? 'جوال' : 'Mobile'}
            </button>
          </div>

          {/* Live Preview */}
          <div className={`bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm ${
            previewDevice === 'mobile' ? 'max-w-sm mx-auto' : ''
          }`}>
            {/* Preview Top Bar */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ backgroundColor: form.primary_color }}
            >
              <div className="flex items-center gap-2">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="w-7 h-7 rounded object-contain bg-white" />
                ) : (
                  <div className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                    G
                  </div>
                )}
                <span className="text-white font-bold text-sm">{form.app_name || 'GymCore'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/20" />
                <div className="w-6 h-6 rounded-full bg-white/20" />
              </div>
            </div>

            {/* Preview Sidebar + Content */}
            <div className="flex min-h-[300px]">
              <div
                className="w-20 p-3 flex flex-col items-center gap-3 shrink-0"
                style={{ backgroundColor: form.sidebar_bg }}
              >
                {[
                  { icon: 'grid', label: isRtl ? 'الرئيسية' : 'Home' },
                  { icon: 'users', label: isRtl ? 'الصالات' : 'Gyms' },
                  { icon: 'chart', label: isRtl ? 'التقارير' : 'Reports' },
                ].map((item) => (
                  <div key={item.icon} className="flex flex-col items-center gap-0.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs"
                      style={{ backgroundColor: `${form.primary_color}15`, color: form.primary_color }}
                    >
                      {item.icon === 'grid' ? 'âٹ‍' : item.icon === 'users' ? 'ًں‘¥' : 'ًں“ٹ'}
                    </div>
                    <span className="text-[8px]" style={{ color: form.sidebar_text }}>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Preview Content Area */}
              <div className="flex-1 p-4 bg-gray-50">
                <div
                  className="h-2 w-24 rounded-full mb-4"
                  style={{ backgroundColor: form.accent_color }}
                />
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-white border border-gray-100 p-2 flex flex-col justify-end">
                      <div className="h-1.5 w-8 rounded-full bg-gray-200 mb-1" />
                      <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: form.primary_color }} />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded-full bg-gray-200" />
                  <div className="h-3 w-3/4 rounded-full bg-gray-200" />
                  <div className="h-3 w-1/2 rounded-full bg-gray-200" />
                </div>
                <div className="mt-4 p-3 rounded-xl border border-gray-100 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: form.accent_color }} />
                    <span className="text-xs font-medium" style={{ color: form.primary_color }}>
                      {isRtl ? 'تم تطبيق الألوان الجديدة' : 'New colors applied'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {isRtl ? 'هذه معاينة حية للألوان التي اخترتها' : 'This is a live preview of your selected colors'}
                  </p>
                </div>
              </div>
            </div>

            {/* Preview Footer */}
            <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-center">
              <span className="text-[10px] text-gray-400">{form.footer_text}</span>
            </div>

            {/* Branding summary */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-400">{isRtl ? 'الألوان المطبقة:' : 'Applied colors:'}</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border" style={{ backgroundColor: form.primary_color }} title="Primary" />
                  <div className="w-3 h-3 rounded border" style={{ backgroundColor: form.accent_color }} title="Accent" />
                  <div className="w-3 h-3 rounded border" style={{ backgroundColor: form.sidebar_bg }} title="Sidebar BG" />
                  <div className="w-3 h-3 rounded border" style={{ backgroundColor: form.sidebar_text }} title="Sidebar Text" />
                </div>
                {form.logo_url && (
                  <img src={form.logo_url} alt="" className="w-4 h-4 rounded" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

