import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardSkeletonProps {
  stats?: number;
  showCharts?: boolean;
  listItems?: number;
}

const DashboardSkeleton = ({ stats = 4, showCharts = true, listItems = 5 }: DashboardSkeletonProps) => {
  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${stats >= 5 ? "grid-cols-2 md:grid-cols-5" : stats === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-4"}`}>
        {Array.from({ length: stats }).map((_, index) => (
          <Card key={index} className="glass-card border-0 rounded-2xl overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showCharts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="glass-card border-0 rounded-2xl overflow-hidden">
              <CardHeader className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full rounded-2xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="glass-card border-0 rounded-2xl overflow-hidden">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: listItems }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardSkeleton;
