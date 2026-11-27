import {
  BookOpen,
  CodeXml,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Palette,
} from "lucide-react";
import type { NavIcon } from "./nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  projects: FolderKanban,
  billing: CreditCard,
  overview: LayoutDashboard,
  knowledge: BookOpen,
  conversations: MessagesSquare,
  customize: Palette,
  install: CodeXml,
};
