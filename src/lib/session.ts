import { cookies } from "next/headers";

const COOKIE = "lf_participant";

export async function getParticipantId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setParticipantId(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 120, // ~4 meses (cubre todo el Mundial)
    path: "/",
  });
}
