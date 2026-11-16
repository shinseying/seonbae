import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { createAdminClient } from "../../../utils/supabase/admin";
import {
  BILLING_ACCESS_COOKIE,
  readBillingAccess,
} from "../../../utils/auth/portal-otp";
import { loadBillingItems, type BillingLineItem } from "../../../utils/billing/statement";
import { inipayConfig } from "../../../utils/billing/inipay";
import { type PaidMonth, type PaymentResult } from "./BillingClient";
import BillingPageContent from "./BillingPageContent";
import styles from "../parent.module.css";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "parent") redirect("/portal");

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const access = readBillingAccess(
    cookieStore.get(BILLING_ACCESS_COOKIE)?.value,
    user.id,
    requestHeaders,
  );

  let items: BillingLineItem[] = [];
  let paidMonths: PaidMonth[] = [];
  if (access) {
    items = await loadBillingItems(user.id);
    paidMonths = await loadPaidMonths(user.id);
  }

  const { payment } = await searchParams;
  const paymentResult: PaymentResult | null =
    payment === "paid" || payment === "failed" || payment === "closed" ? payment : null;

  return (
    <main className={styles.page}>
      <BillingPageContent
        locked={!access}
        accessExpiresAt={access?.expiresAt ?? null}
        // Phone OTP is off until SMS delivery is provisioned.
        methods={{ email: Boolean(profile.email || user.email), phone: false }}
        items={items}
        paymentEnabled={Boolean(inipayConfig())}
        paidMonths={paidMonths}
        paymentResult={paymentResult}
      />
    </main>
  );
}

// Payments are service-role only. A missing key or table must not take the
// statement down with it, so a failure reads as "nothing paid yet".
async function loadPaidMonths(parentId: string): Promise<PaidMonth[]> {
  try {
    const { data: payments } = await createAdminClient()
      .from("billing_payments")
      .select("billing_month,amount_krw,approved_at")
      .eq("parent_id", parentId)
      .eq("status", "paid");
    return (payments ?? []).map((payment) => ({
      month: payment.billing_month,
      amountKrw: payment.amount_krw,
      approvedAt: payment.approved_at,
    }));
  } catch {
    return [];
  }
}
