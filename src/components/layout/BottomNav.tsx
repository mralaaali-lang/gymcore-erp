import { NavLink } from 'react-router-dom';
import { NAV_ICON_MAP } from './navIcons';

interface BottomNavProps {
  items: { label: string; icon: string; path: string }[];
}

export default function BottomNav({ items }: BottomNavProps) {
  return (
    <nav className="bg-surface-container shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] fixed bottom-0 inset-x-0 w-full z-50 flex justify-around items-center px-2 py-3 md:hidden rounded-t-xl">
      {items.map((item) => {
        const symbol = NAV_ICON_MAP[item.icon] || 'circle';
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center rounded-2xl px-3 py-1 transition-colors group min-w-[64px] ${
                isActive ? 'text-petrol' : 'text-on-surface-variant hover:text-petrol'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined mb-0.5 text-xl ${isActive ? 'fill' : ''}`}>
                  {symbol}
                </span>
                <span className="font-caption text-[10px] leading-tight text-center truncate max-w-[64px]">
                  {item.label.split(' ')[0]}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
