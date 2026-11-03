import { ListCard } from "@/components/common/ui/ListCard";

export function ProfileStats({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <div className="flex gap-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 flex-1">
          <ListCard>
            <div className="space-y-1 p-3">
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              <p className="text-sm text-muted">{item.label}</p>
            </div>
          </ListCard>
        </div>
      ))}
    </div>
  );
}
