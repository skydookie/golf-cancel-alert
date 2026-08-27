import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { watchConditionInputSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const conditions = await prisma.watchCondition.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(conditions);
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const parsed = watchConditionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.", 400);
  }

  const condition = await prisma.watchCondition.create({
    data: { userId, ...parsed.data },
  });
  return NextResponse.json(condition, { status: 201 });
}
