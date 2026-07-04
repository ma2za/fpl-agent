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

- recommendation JSON
- manual checklist markdown
- legality report
- deterministic template output

## Milestone 6: Verification

- recommendation validation command
- illegal recommendation blocking
- tests for invalid scenarios

## Milestone 7: Cron Support

- `--gw auto`
- deadline detection
- safe failure behavior
- cron documentation

## Milestone 8: Website

- generated recommendation archive
- recommendation detail pages
- squad page backed by config/data
- methodology and postmortem pages

## Milestone 9: Postmortems

- load saved recommendations
- compare projections to actual points
- write postmortem JSON and markdown
