import type { Frequency } from "@/types/api"

const FREQUENCY_UNIT: Record<Frequency, string> = {
  monthly: "month",
  weekly: "week",
  yearly: "year",
  custom: "week",
}

export function frequencyLabel(frequency: Frequency, interval: number): string {
  const raw = interval === 1 ? frequency : `every ${interval} ${FREQUENCY_UNIT[frequency]}${interval > 1 ? "s" : ""}`
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
