import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { tutorPhotoExtension, tutorPhotoUploadError } from "../../../../../utils/files/image-upload";
import { createAdminClient } from "../../../../../utils/supabase/admin";
import { createClient } from "../../../../../utils/supabase/server";
import { isManagedTutorPhotoPath } from "../../../../../utils/tutors/admin-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_400_000) {
    return NextResponse.json({ error: "프로필 사진은 4MB 이하만 사용할 수 있습니다." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "업로드 요청을 읽지 못했습니다." }, { status: 400 });
  }

  const file = form.get("photo");
  const validationError = await tutorPhotoUploadError(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const photo = file as File;
  if (!tutorPhotoExtension(photo.type)) {
    return NextResponse.json({ error: "사진 형식을 확인해 주세요." }, { status: 400 });
  }

  let normalizedPhoto: Buffer;
  try {
    // Re-encoding strips EXIF/GPS metadata and caps oversized dimensions.
    normalizedPhoto = await sharp(Buffer.from(await photo.arrayBuffer()))
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "사진 파일의 실제 형식을 확인해 주세요." }, { status: 400 });
  }

  const path = `profiles/${randomUUID()}.webp`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("tutor-profile-photos")
    .upload(path, normalizedPhoto, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[admin tutor photo]", error);
    return NextResponse.json({ error: "사진을 업로드하지 못했습니다." }, { status: 500 });
  }

  const { data } = admin.storage.from("tutor-profile-photos").getPublicUrl(path);
  return NextResponse.json(
    { photoUrl: data.publicUrl, photoPath: path },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!isManagedTutorPhotoPath(path)) {
    return NextResponse.json({ error: "사진 경로를 확인해 주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { count, error: lookupError } = await admin
    .from("tutors")
    .select("registry_id", { count: "exact", head: true })
    .eq("photo_path", path);
  if (lookupError) return NextResponse.json({ error: "사진 사용 여부를 확인하지 못했습니다." }, { status: 500 });
  if (count) return NextResponse.json({ error: "현재 카드에서 사용하는 사진입니다." }, { status: 409 });

  const { error } = await admin.storage.from("tutor-profile-photos").remove([path]);
  if (error) return NextResponse.json({ error: "사진을 정리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
