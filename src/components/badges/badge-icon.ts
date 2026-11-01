import type { LucideIcon } from "lucide-react";
import { Droplets, Flag, Flame, HandHeart, Medal, MessageSquareHeart, Recycle, Trophy, Wrench, Zap } from "lucide-react";
import type { BadgeId } from "@/lib/domain";

export const BADGE_ICON: Record<BadgeId, LucideIcon> = {
  first_report: Flag,
  five_reports: Medal,
  ten_reports: Trophy,
  helper: HandHeart,
  fixer_friend: Wrench,
  feedback_giver: MessageSquareHeart,
  water_watcher: Droplets,
  power_patrol: Zap,
  clean_campus: Recycle,
  streak_3: Flame,
};
