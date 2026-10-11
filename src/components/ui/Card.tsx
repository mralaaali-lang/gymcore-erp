import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = '', hoverable, onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 text-start w-full ${hoverable || onClick ? 'hover:shadow-md transition-shadow duration-300 cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}
