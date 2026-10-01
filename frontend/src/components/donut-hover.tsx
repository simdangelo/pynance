import { useRef, useState, type MouseEvent, type ReactNode } from "react"

import { Money } from "@/components/money"

export interface HoverSlice {
  id: string | number
  name: string
  color: string
  value: string
  extra?: string
}

const POPUP_WIDTH = 200
const POPUP_HEIGHT = 44

/**
 * Popup details for donut charts: it follows the cursor without re-rendering
 * the component, stays visible while the pointer is inside the chart area
 * (gaps included) and switches only when another slice is entered.
 */
export function useDonutHover(slices: HoverSlice[]) {
  const popupRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const sizeRef = useRef({ width: 0, height: 0 })
  const flipRef = useRef({ x: false, y: false })
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const active = activeIndex !== null ? (slices[activeIndex] ?? null) : null

  const positionPopup = () => {
    const popup = popupRef.current
    if (!popup) return
    const { x, y } = pointerRef.current
    popup.style.left = `${flipRef.current.x ? x - POPUP_WIDTH : x + 14}px`
    popup.style.top = `${flipRef.current.y ? y - POPUP_HEIGHT : y + 14}px`
  }

  const setPopupRef = (node: HTMLDivElement | null) => {
    popupRef.current = node
    if (node) positionPopup()
  }

  const trackPointer = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    sizeRef.current = { width: rect.width, height: rect.height }
    pointerRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    positionPopup()
  }

  const enterSlice = (index: number) => {
    flipRef.current = {
      x: pointerRef.current.x + POPUP_WIDTH + 14 > sizeRef.current.width,
      y: pointerRef.current.y + POPUP_HEIGHT + 14 > sizeRef.current.height,
    }
    setActiveIndex(index)
  }

  const containerProps = {
    onMouseEnter: trackPointer,
    onMouseMove: trackPointer,
    onMouseLeave: () => setActiveIndex(null),
  }

  const popup: ReactNode = active ? (
    <div
      key={active.id}
      ref={setPopupRef}
      className="animate-in fade-in-0 zoom-in-95 pointer-events-none absolute z-10 min-w-44 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl duration-100"
    >
      <span className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: active.color }}
        />
        <span className="text-muted-foreground">{active.name}</span>
        <span className="ml-auto font-numeric font-medium text-foreground">
          <Money value={active.value} />
        </span>
        {active.extra && (
          <span className="font-numeric text-muted-foreground">{active.extra}</span>
        )}
      </span>
    </div>
  ) : null

  return { containerProps, enterSlice, popup }
}
