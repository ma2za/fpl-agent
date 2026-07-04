import { z } from "zod";
import {
  BootstrapStaticSchema,
  ElementTypeSchema,
  EventSchema,
  FixtureSchema,
  LiveGameweekSchema,
  PlayerSchema,
  PlayerSummarySchema,
  TeamSchema
} from "./schemas";

export type BootstrapStatic = z.infer<typeof BootstrapStaticSchema>;
export type ElementType = z.infer<typeof ElementTypeSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;
export type LiveGameweek = z.infer<typeof LiveGameweekSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;
export type Team = z.infer<typeof TeamSchema>;

export type NormalizedPlayer = {
  id: number;
  name: string;
  webName: string;
  nowCost: number;
  price: number;
  position: string;
  team: string;
  teamId: number;
  elementType: number;
  status: string;
  chanceOfPlayingNextRound: number | null;
  chanceOfPlayingThisRound: number | null;
  expectedPointsNext: number | null;
  expectedPointsThis: number | null;
  form: number | null;
  minutes: number | null;
  selectedByPercent: number | null;
  totalPoints: number | null;
};
