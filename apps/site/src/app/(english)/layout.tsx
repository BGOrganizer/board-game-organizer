import type { ReactNode } from "react";
import { SiteDocument } from "../../components/SiteDocument";
import { siteMetadata } from "../../lib/siteMetadata";

export const metadata = siteMetadata("en");

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="en">{children}</SiteDocument>;
}
