export const LEKINPY_VERSION = "0.2.0";
export const LEKINPY_WHEEL_PATH = `${import.meta.env.BASE_URL}vendor/lekinpy-${LEKINPY_VERSION}-py3-none-any.whl`;
export const LEKINPY_CHECKSUM_PATH = `${LEKINPY_WHEEL_PATH}.sha256`;

export function normalizeSha256(value: string): string {
  const digest = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error("The pinned lekinpy checksum file is malformed.");
  }
  return digest;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyWheel(fetcher: typeof fetch = fetch): Promise<string> {
  const [wheelResponse, checksumResponse] = await Promise.all([
    fetcher(LEKINPY_WHEEL_PATH),
    fetcher(LEKINPY_CHECKSUM_PATH),
  ]);
  if (!wheelResponse.ok) throw new Error(`Unable to load the pinned lekinpy wheel (${wheelResponse.status}).`);
  if (!checksumResponse.ok) throw new Error(`Unable to load the pinned wheel checksum (${checksumResponse.status}).`);

  const [wheelBytes, checksumText] = await Promise.all([
    wheelResponse.arrayBuffer(),
    checksumResponse.text(),
  ]);
  const expected = normalizeSha256(checksumText);
  const actual = await sha256Hex(wheelBytes);
  if (actual !== expected) {
    throw new Error(`Pinned lekinpy wheel integrity check failed: expected ${expected}, received ${actual}.`);
  }
  return expected;
}
