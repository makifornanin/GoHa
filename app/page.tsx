import { redirect } from "next/navigation";

export default function RootPage() {
  // Today is the home surface of GoHa.
  redirect("/today");
}
