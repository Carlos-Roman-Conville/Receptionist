import { z } from 'zod';

export const PLACEHOLDER_FILL = /<<FILL(?::[^>]*)?>>/g;

export const metaSchema = z.object({
  client_slug: z.string(),
  verified_on: z.union([z.string(), z.date()]).optional(),
});

export const dayHoursSchema = z.union([
  z.object({
    open: z.string(),
    close: z.string(),
    by_appointment: z.boolean().optional(),
  }),
  z.object({
    open: z.null(),
    close: z.null(),
    by_appointment: z.literal(true),
  }),
]);

export const businessDetailsSchema = z
  .object({
    meta: metaSchema,
    identity: z.record(z.unknown()),
    hours: z
      .object({
        timezone: z.string().optional(),
        regular: z.record(dayHoursSchema).optional(),
        after_hours_policy: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const serviceItemSchema = z
  .object({
    name: z.string(),
    bookable_directly: z.boolean().optional(),
    duration_minutes: z.union([z.number(), z.string()]).optional(),
    buffer_minutes: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const servicesSchema = z
  .object({
    meta: metaSchema.optional(),
    pricing_policy: z.record(z.unknown()).optional(),
    services: z.array(serviceItemSchema).optional(),
    min_notice_hours: z.union([z.number(), z.string()]).optional(),
    min_notice_enforcement: z.string().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    for (const svc of data.services ?? []) {
      if (svc.bookable_directly !== true) continue;
      const dur = svc.duration_minutes;
      const buf = svc.buffer_minutes;
      if (dur === undefined || dur === null || String(dur).startsWith('<<')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Service "${svc.name}" is bookable but missing duration_minutes`,
        });
      }
      if (buf === undefined || buf === null || String(buf).startsWith('<<')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Service "${svc.name}" is bookable but missing buffer_minutes`,
        });
      }
    }
  });

export const complianceSchema = z
  .object({
    meta: metaSchema.optional(),
    disclosure: z.record(z.unknown()).optional(),
    recording: z.record(z.unknown()).optional(),
    never_say: z
      .object({
        locked: z.array(z.string()).optional(),
        client_specific: z.array(z.string()).optional(),
      })
      .optional(),
    emergency: z.record(z.unknown()).optional(),
    escalation: z
      .object({
        soft_cap_minutes: z.union([z.number(), z.string()]).optional(),
        hard_cap_minutes: z.union([z.number(), z.string()]).optional(),
        triggers: z.record(z.unknown()).optional(),
        when_it_does_not_know: z.union([z.string(), z.number()]).optional(),
        at_soft_cap_behavior: z.union([z.string(), z.number()]).optional(),
        at_hard_cap_script: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const esc = data.escalation;
    if (!esc) return;
    const soft = Number(esc.soft_cap_minutes);
    const hard = Number(esc.hard_cap_minutes);
    if (!Number.isNaN(soft) && !Number.isNaN(hard) && soft >= hard) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'soft_cap_minutes must be less than hard_cap_minutes',
      });
    }
  });

export const moduleConfigSchema = z
  .object({
    meta: metaSchema,
    modules: z.record(z.boolean()),
    settings: z.record(z.unknown()).optional(),
    not_in_scope: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const vipListSchema = z.record(z.string(), z.unknown());

export function assertNoFillPlaceholders(
  fileName: string,
  text: string,
): void {
  const matches = text.match(PLACEHOLDER_FILL);
  if (matches?.length) {
    throw new Error(
      `${fileName}: ${matches.length} unfilled <<FILL>> placeholder(s): ${matches.slice(0, 3).join(', ')}`,
    );
  }
}

export function validateSchema<T>(
  schema: z.ZodType<T>,
  fileName: string,
  data: unknown,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ');
    throw new Error(`${fileName}: schema validation failed: ${msg}`);
  }
  return parsed.data;
}
