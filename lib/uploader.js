// Minimal Bunny uploader using the correct header "AccessKey"
// Works on Node 18+ (global fetch). ESM module.
export async function bunnyPut(path, bytes, contentType = "application/octet-stream") {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const host = process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com";

  // Prefer the Storage Zone Password for uploads; fall back to account API key only if explicitly desired.
  const password = process.env.BUNNY_STORAGE_PASSWORD;
  const accountKey = process.env.BUNNY_API_KEY;

  const key = password || accountKey; // DO NOT set both to different values; password is correct for Storage uploads.

  if (!zone) throw new Error("bunny_misconfig: Missing BUNNY_STORAGE_ZONE");
  if (!host) throw new Error("bunny_misconfig: Missing BUNNY_STORAGE_HOST");
  if (!key)  throw new Error("bunny_misconfig: Missing BUNNY_STORAGE_PASSWORD (or BUNNY_API_KEY)");

  if (!path) throw new Error("bunny_misconfig: Missing upload path");

  const url = `https://${host}/${zone}/${path}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "AccessKey": key,
      "Content-Type": contentType || "application/octet-stream"
    },
    body: bytes
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const code = res.status;
    const tag =
      code === 401 ? "bunny_upload_401" :
      code === 403 ? "bunny_upload_403" :
      `bunny_upload_${code}`;
    throw new Error(`${tag}: ${text}`);
  }
  return true;
}