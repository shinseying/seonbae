import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import ThankYouClient from "./ThankYouClient";

export const dynamic = "force-dynamic";

export default async function ThankYouPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=verification-required");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .single();
  const reviewPending = profile?.role === "tutor" && profile?.account_status !== "approved";

  return <ThankYouClient email={user.email || ""} reviewPending={reviewPending} />;
}
