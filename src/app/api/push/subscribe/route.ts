import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }
  const { endpoint, keys } = parsed.data;

  // endpoint는 기기/브라우저별로 유일 — 같은 기기가 다시 구독하면 최신 키로 덮어쓴다.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }

  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint: parsed.data.endpoint } });
  if (sub && sub.userId === userId) {
    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } });
  }
  return NextResponse.json({ ok: true });
}
