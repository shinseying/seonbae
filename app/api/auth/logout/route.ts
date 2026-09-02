import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";
import { clearAccessGateCookies } from "../../../../utils/auth/step-up-server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const cookieStore = await cookies();
  cookieStore.delete("seonbae-remember");
  cookieStore.delete("seonbae-billing-access");
  clearAccessGateCookies(cookieStore);

  return NextResponse.json(
    { authenticated: false, destination: "/" },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    },
  );
}
