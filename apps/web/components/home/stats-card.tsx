"use client";

import { motion } from "motion/react";

interface StatsCardProps {
  value: string | number;
  label: string;
  index?: number;
}

export function StatsCard({ value, label, index = 0 }: StatsCardProps) {
  return (
    <motion.div
      className="rounded-xl border bg-card p-5 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </motion.div>
  );
}
