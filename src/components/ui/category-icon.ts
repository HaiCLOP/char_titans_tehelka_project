import {
  Building2, Bus, CircleHelp, Droplets, GraduationCap, Hotel, ShieldAlert, Trash2, UtensilsCrossed, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/domain";

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  water_supply: Droplets,
  plumbing: Wrench,
  electrical: Zap,
  sanitation: Trash2,
  hostel: Hotel,
  mess_food: UtensilsCrossed,
  infrastructure: Building2,
  it_network: Wifi,
  academic: GraduationCap,
  safety_security: ShieldAlert,
  transport: Bus,
  other: CircleHelp,
};
