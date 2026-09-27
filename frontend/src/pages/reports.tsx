import { ChartColumn } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Card, CardContent } from "@/components/ui/card"

export default function Reports() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Trends, comparisons and breakdowns by category."
      />
      <Card className="p-0">
        <CardContent className="p-0">
          <EmptyState
            icon={ChartColumn}
            title="Reports are coming"
            subtitle="This page will host the detailed analysis: trends over time, month-over-month comparisons and category breakdowns."
            className="py-20"
          />
        </CardContent>
      </Card>
    </div>
  )
}
