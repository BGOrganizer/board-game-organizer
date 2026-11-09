"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { installInputBehavior } from "@/lib/inputBehavior";

export function InputBehavior() {
  const pathname = usePathname();
  useEffect(() => installInputBehavior(), [pathname]);
  return null;
}
