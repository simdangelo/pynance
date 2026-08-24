import { useRef } from "react"
import { Calendar } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

export function DateField({ label, value, onChange, required }: DateFieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="YYYY-MM-DD"
          pattern="\d{4}-\d{2}-\d{2}"
          className="font-numeric pr-9"
        />
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pointer-events-none absolute top-1/2 right-1 h-px w-px -translate-y-1/2 opacity-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (typeof pickerRef.current?.showPicker === "function") {
              pickerRef.current.showPicker()
            } else {
              pickerRef.current?.focus()
            }
          }}
          aria-label={`Open date picker for ${label}`}
        >
          <Calendar className="size-4" />
        </Button>
      </div>
    </div>
  )
}