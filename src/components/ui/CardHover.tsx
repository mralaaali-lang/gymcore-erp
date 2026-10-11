import { motion } from 'framer-motion';

export default function CardHover({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className={className}>
      {children}
    </motion.div>
  );
}
