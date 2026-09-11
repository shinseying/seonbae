import { redirect } from "next/navigation";

// Keep every tutor application on the account-backed signup flow.
export default function TutorApplyPage() {
  redirect("/login?mode=signup&role=tutor");
}
