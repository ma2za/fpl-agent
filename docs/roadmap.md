# Roadmap

## Milestone 1: Repo Skeleton

- pnpm workspace
- read-only Next.js app
- package placeholders
- config examples
- documentation

## Milestone 2: FPL API Client

- public endpoint constants: done
- fetch client: done
- local caching: done
- response validation: done
- fixture-based tests: done

## Milestone 3: Rules Engine

- squad legality: done
- budget validation: done
- club limit validation: done
- formation validation: done
- transfer validation: done
- captaincy, bench, chip, and deadline validation: done
- provisional data warnings: done

## Milestone 4: Decision Engine

- transparent projections: done
- transfer candidates: done
- captain ranking: done
- bench order: done
- conservative chip recommendations: done

## Milestone 5: Recommendation Output

- evidence pack output: done
- recommendation template output: done
- placeholder manual checklist: done
- no script-selected players: done

## Milestone 6: Verification

- agent-authored recommendation validation command: done
- illegal recommendation blocking: done
- tests for invalid scenarios: done

## Milestone 7: Agent Decision Toolkit

- manual context notes: done
- richer evidence pack: done
- projection summary and decision prompts: done
- recommendation quality gates: done
- expanded verification report: done
- fixture ticker evidence: done
- squad comparison command: done

## Milestone 8: Cron Support

- `--gw auto`
- deadline detection
- safe failure behavior
- cron documentation

## Milestone 9: Website

- generated recommendation archive
- recommendation detail pages
- squad page backed by config/data
- methodology and postmortem pages

## Milestone 10: Postmortems

- load saved recommendations
- compare projections to actual points
- write postmortem JSON and markdown
