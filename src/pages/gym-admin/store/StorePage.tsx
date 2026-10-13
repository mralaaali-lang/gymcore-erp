import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../../context/GymBrandContext';
import ProductCatalog from './ProductCatalog';
import PurchasesPanel from './PurchasesPanel';
import SuppliersPanel from './SuppliersPanel';

// Store hub — merged three duplicated inventory pages into one tabbed page (§23):
//   InventoryManagement (products) → tab "products"   (also served to reception)
//   PurchasesPage (purchases)      → tab "purchases"  (manager-only endpoints)
//   SuppliersPage (suppliers)      → tab "suppliers"  (manager-only endpoints)
// Old routes /admin/purchases|suppliers redirect here with ?tab= deep links.
// Reception keeps read/write on products only; their sidebar entry /reception/products
// renders this page with the tab bar hidden (purchases/suppliers would 403).
const TABS = [
  { key: 'products', icon: 'inventory_2', ar: 'المنتجات', en: 'Products' },
  { key: 'purchases', icon: 'shopping_cart', ar: 'المشتريات', en: 'Purchases' },
  { key: 'suppliers', icon: 'local_shipping', ar: 'الموردون', en: 'Suppliers' },
] as const;

export default function StorePage() {
  const { language, role } = useApp();
  const rtl = language === 'ar';
  const isManager = role === 'gym-admin';
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || 'products';
  const activeKey = isManager && TABS.some((t) => t.key === requested) ? requested : 'products';

  const switchTab = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — heading moved to the top bar */}

      {isManager && (
        <div className="flex gap-2 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                activeKey === t.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{t.icon}</span>
              {rtl ? t.ar : t.en}
            </button>
          ))}
        </div>
      )}

      {activeKey === 'products' && <ProductCatalog />}
      {activeKey === 'purchases' && <PurchasesPanel />}
      {activeKey === 'suppliers' && <SuppliersPanel />}
    </div>
  );
}
