import { z } from "zod";

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");

export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:mm(24시간제) 형식이어야 합니다.");

export const watchConditionInputSchema = z
  .object({
    dates: z.array(dateStringSchema).min(1, "날짜를 하나 이상 선택해야 합니다."),
    timeStart: timeStringSchema,
    timeEnd: timeStringSchema,
  })
  .refine((v) => v.timeStart < v.timeEnd, {
    message: "시작 시간은 종료 시간보다 빨라야 합니다.",
    path: ["timeStart"],
  });
