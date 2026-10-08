import { Redirect } from "expo-router";
export default function OrganizationsScreen() {
  return <Redirect href={{ pathname: "/groups", params: { section: "organizations" } }} />;
}
