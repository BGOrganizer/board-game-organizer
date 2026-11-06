import { ListCard } from "@/components/common/ui/ListCard";

export function ProfileStats({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-3 grid-rows-[auto_auto] gap-x-2">
      {items.map((item) => (
        <div key={item.label} className="row-span-2 grid min-w-0 grid-rows-subgrid">
          <ListCard className="row-span-2 grid h-full grid-rows-subgrid gap-y-1 p-3">
            <p className="text-lg font-semibold tabular-nums">{item.value}</p>
            <p className="text-sm text-muted">{item.label}</p>
          </ListCard>
        </div>
      ))}
    </div>
  );
}
