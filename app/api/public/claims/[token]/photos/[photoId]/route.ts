import { getClaimPhoto } from "../../../../../../../lib/database";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string; photoId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { token, photoId } = await params;
  const photo = getClaimPhoto(token, photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  const safeName = photo.name.replace(/[^a-zA-Z0-9._ -]/g, "").trim() || "claim-photo";
  return new Response(Uint8Array.from(photo.data).buffer, {
    headers: {
      "content-type": photo.mimeType,
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
