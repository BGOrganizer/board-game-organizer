import type { ReactNode } from "react";
import { GroupDiscoverySession } from "@/components/groups/GroupDiscoverySession";

export default function GroupsLayout({ children }: { children: ReactNode }) {
  return <GroupDiscoverySession>{children}</GroupDiscoverySession>;
}
