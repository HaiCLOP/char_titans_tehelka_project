import { redirect } from "next/navigation";

export default function GuidePage() {
  redirect("/?tour=true");
}
