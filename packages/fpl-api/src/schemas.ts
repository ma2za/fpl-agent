import { z } from "zod";

const NullableNumberSchema = z.number().nullable();
const NullableStringNumberSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((value) => (value === null ? null : Number(value)));

export const TeamSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    short_name: z.string().optional()
  })
  .passthrough();

export const ElementTypeSchema = z
  .object({
    id: z.number(),
    singular_name: z.string().optional(),
    singular_name_short: z.string()
  })
  .passthrough();

export const PlayerSchema = z
  .object({
    id: z.number(),
    first_name: z.string(),
    second_name: z.string(),
    web_name: z.string(),
    element_type: z.number(),
    team: z.number(),
    now_cost: z.number(),
    status: z.string(),
    chance_of_playing_next_round: NullableNumberSchema.optional(),
    chance_of_playing_this_round: NullableNumberSchema.optional(),
    ep_next: NullableStringNumberSchema.optional(),
    ep_this: NullableStringNumberSchema.optional(),
    form: NullableStringNumberSchema.optional(),
    minutes: z.number().optional(),
    selected_by_percent: NullableStringNumberSchema.optional(),
    total_points: z.number().optional()
  })
  .passthrough();

export const EventSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    deadline_time: z.string(),
    is_current: z.boolean(),
    is_next: z.boolean(),
    is_previous: z.boolean()
  })
  .passthrough();

export const BootstrapStaticSchema = z
  .object({
    elements: z.array(PlayerSchema),
    element_types: z.array(ElementTypeSchema),
    events: z.array(EventSchema),
    teams: z.array(TeamSchema)
  })
  .passthrough();

export const FixtureSchema = z
  .object({
    id: z.number(),
    event: z.number().nullable(),
    team_h: z.number(),
    team_a: z.number(),
    team_h_difficulty: z.number(),
    team_a_difficulty: z.number(),
    kickoff_time: z.string().nullable(),
    finished: z.boolean()
  })
  .passthrough();

export const PlayerSummarySchema = z
  .object({
    fixtures: z.array(z.record(z.string(), z.unknown())),
    history: z.array(z.record(z.string(), z.unknown())),
    history_past: z.array(z.record(z.string(), z.unknown()))
  })
  .passthrough();

export const LiveGameweekSchema = z
  .object({
    elements: z.array(
      z
        .object({
          id: z.number(),
          stats: z.record(z.string(), z.unknown())
        })
        .passthrough()
    )
  })
  .passthrough();

export const UnknownPublicEndpointSchema = z.unknown();
