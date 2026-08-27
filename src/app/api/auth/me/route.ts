import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  return NextResponse.json({ id: user.id, email: user.email });
}
