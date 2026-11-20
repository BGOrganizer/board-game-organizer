import type { ReactNode } from "react";
import { SiteDocument } from "../../components/SiteDocument";
import { siteMetadata } from "../../lib/siteMetadata";

export const metadata = siteMetadata("it");

export default function ItalianLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="it">{children}</SiteDocument>;
}
