import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "비밀번호 재설정 | 선배",
  description: "선배 포털 계정의 비밀번호를 안전하게 변경합니다.",
};

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ResetPasswordForm />;
}
