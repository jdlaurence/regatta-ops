// Zod schemas for the loading-rule union and placement reasons (PLAN.md §9.3.3).

import { z } from 'zod';
import { boatClassSchema, idSchema } from './common';

export const ruleWeightSchema = z.literal([1, 2, 3]);
export const ruleOriginSchema = z.enum(['trailer', 'regatta']);

const empty = z.record(z.string(), z.never());
const tiers = z.array(z.number().int().min(1));

function rule<T extends string, P extends z.ZodType>(type: T, params: P) {
  return z.object({
    id: z.string().min(1),
    type: z.literal(type),
    hard: z.boolean(),
    weight: ruleWeightSchema,
    enabled: z.boolean(),
    origin: ruleOriginSchema,
    params,
  });
}

export const fitRuleSchema = rule(
  'fit',
  z.object({ clearanceCm: z.number().min(0), gapCm: z.number().min(0) }),
);
export const shelfClassesRuleSchema = rule(
  'shelf-classes',
  z.object({ shelfIds: z.array(idSchema), classes: z.array(boatClassSchema) }),
);
export const shelfLanesRuleSchema = rule(
  'shelf-lanes',
  z.object({
    shelfId: idSchema,
    lanes: z.number().int().min(1),
    classes: z.array(boatClassSchema).optional(),
  }),
);
export const shelfOffRuleSchema = rule('shelf-off', z.object({ shelfIds: z.array(idSchema) }));
export const overhangRuleSchema = rule(
  'overhang',
  z.object({ tiers, frontMaxCm: z.number().min(0), rearMaxCm: z.number().min(0) }),
);
export const maxBoatsRuleSchema = rule(
  'max-boats',
  z.object({ shelfId: idSchema, max: z.number().int().min(0) }),
);
export const pinRuleSchema = rule(
  'pin',
  z.object({ shellId: idSchema, shelfId: idSchema, lane: z.number().int().min(0).optional() }),
);
export const classTierRuleSchema = rule(
  'class-tier',
  z.object({ classes: z.array(boatClassSchema), tiers }),
);
export const heavyLowRuleSchema = rule('heavy-low', empty);
export const forwardBiasRuleSchema = rule('forward-bias', empty);
export const sideBalanceRuleSchema = rule(
  'side-balance',
  z.object({ tolerancePct: z.number().min(0).max(100) }),
);
export const unloadOrderRuleSchema = rule('unload-order', empty);
export const teamTogetherRuleSchema = rule(
  'team-together',
  z.object({ teamIds: z.array(idSchema).optional() }),
);
export const fragileInsideRuleSchema = rule('fragile-inside', empty);

export const ruleSchema = z.discriminatedUnion('type', [
  fitRuleSchema,
  shelfClassesRuleSchema,
  shelfLanesRuleSchema,
  shelfOffRuleSchema,
  overhangRuleSchema,
  maxBoatsRuleSchema,
  pinRuleSchema,
  classTierRuleSchema,
  heavyLowRuleSchema,
  forwardBiasRuleSchema,
  sideBalanceRuleSchema,
  unloadOrderRuleSchema,
  teamTogetherRuleSchema,
  fragileInsideRuleSchema,
]);

export const reasonSchema = z.object({
  ruleId: z.string(),
  text: z.string(),
  score: z.number().optional(),
  hard: z.boolean(),
});
