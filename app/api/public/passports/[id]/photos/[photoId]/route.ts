import { getPassportPhoto } from "../../../../../../../lib/database";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  const photo = getPassportPhoto(id, photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  const body = Uint8Array.from(photo.data).buffer;
  const safeName = photo.name.replace(/[^a-zA-Z0-9._ -]/g, "").trim() || "device-photo";
  return new Response(body, {
    headers: {
      "content-type": photo.mimeType,
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
