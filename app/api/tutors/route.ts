import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Every tutor card shows the same image for now, so the per-person portraits
// are not served here.
const TUTOR_CARD_PHOTO = "/images/ian-bae-placeholder.png";

const publicProfiles: Record<string, { name_en: string; photo_url: string }> = {
  "P-001": { name_en: "Ian Bae", photo_url: TUTOR_CARD_PHOTO },
  "P-002": { name_en: "Seung-Yun Shin", photo_url: TUTOR_CARD_PHOTO },
  "P-003": { name_en: "Byeongguk Oh", photo_url: TUTOR_CARD_PHOTO },
};

export async function GET() {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Tutor directory is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let { data, error } = await supabase
    .from("tutors")
    .select(
      "registry_id,name,exam,score,category,tier,university,university_en,photo_url,banner_url,display_order,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format",
    )
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("registry_id", { ascending: true });

  if (error) {
    const fallback = await supabase
      .from("tutors")
      .select("registry_id,name,exam,score,category,tier,display_order")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("registry_id", { ascending: true });

    if (fallback.error) {
      return NextResponse.json(
        { error: "Tutor directory is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    data = fallback.data?.map((row) => ({
      ...row,
      university: row.registry_id === "P-002" ? "서울대학교" : "고려대학교",
      university_en:
        row.registry_id === "P-002" ? "Seoul National University" : "Korea University",
      photo_url: null,
      banner_url:
        row.registry_id === "P-002"
          ? "/university-snu-banner.png"
          : "/university-korea-banner.png",
    })) as typeof data;
    error = null;
  }

  const publicRows = (data ?? []).map((row) => {
    const profile = publicProfiles[row.registry_id];
    return {
      ...row,
      name_en: profile?.name_en || row.name,
      photo_url: profile?.photo_url || row.photo_url || null,
    };
  });

  return NextResponse.json(publicRows, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
