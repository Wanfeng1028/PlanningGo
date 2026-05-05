import type { LucideIcon } from "lucide-react";

export type NavKey = "home" | "features" | "cases" | "design" | "developers" | "profile";

export type ModalKey =
  | "login"
  | "register"
  | "identity"
  | "location"
  | "reservation"
  | "ticket"
  | "payment"
  | "vote"
  | "privacy"
  | "apiKey";

export interface NavItem {
  key: NavKey;
  label: string;
}

export interface ModalContent {
  key: ModalKey;
  title: string;
  eyebrow: string;
  body: string;
  primary: string;
  secondary: string;
  bullets: string[];
}

export interface FlowItem {
  title: string;
  desc: string;
  source: string;
  mode: "page" | "modal" | "drawer" | "sheet" | "state";
  modal?: ModalKey;
}

export interface SectionBlock {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  icon: LucideIcon;
  items: FlowItem[];
}

export interface CaseCard {
  title: string;
  desc: string;
  tags: string[];
  metric: string;
}

export interface TimelineItem {
  time: string;
  title: string;
  desc: string;
  status: "done" | "active" | "pending";
}
