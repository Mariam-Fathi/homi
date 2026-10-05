import type { TimeSlot, ViewingStatus } from "@/types/api";

export const VIEWING_STATUS_LABELS: Record<ViewingStatus, string> = {
  requested: "Requested",
  contacted: "Agent contacted you",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Tailwind classes for the status badge: [background, text].
export const VIEWING_STATUS_COLORS: Record<ViewingStatus, [string, string]> = {
  requested: ["bg-yellow-100", "text-yellow-800"],
  contacted: ["bg-blue-100", "text-blue-800"],
  scheduled: ["bg-green-100", "text-green-800"],
  completed: ["bg-gray-100", "text-gray-700"],
  cancelled: ["bg-red-100", "text-red-800"],
};

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};
