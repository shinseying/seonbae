import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const legacyEnglishNames: Record<string, string> = {
  "P-001": "Ian Bae",
  "P-002": "Seung-Yun Shin",
  "P-003": "Byeongguk Oh",
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
      "registry_id,roster_number,name,exam,score,category,university,university_en,photo_url,banner_url,display_order,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format,created_at",
    )
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("registry_id", { ascending: true });

  if (error) {
    const fallback = await supabase
      .from("tutors")
      .select("registry_id,name,exam,score,category,display_order,created_at")
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
    return {
      ...row,
      name_en: legacyEnglishNames[row.registry_id] || row.name,
      photo_url: row.photo_url || null,
    };
  });

  return NextResponse.json(publicRows, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
