import { Events } from "@/components/events/Events";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  return <Events initialSection={section === "available" ? "available" : "mine"} />;
}
