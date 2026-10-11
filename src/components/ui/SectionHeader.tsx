import { type LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
}

export default function SectionHeader({ title, icon: Icon, iconColor = 'text-petrol' }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-stack-md">
      <Icon size={18} className={iconColor} strokeWidth={2} />
      <h2 className="text-headline-md font-bold text-on-surface">{title}</h2>
    </div>
  );
}
