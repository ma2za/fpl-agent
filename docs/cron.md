# Cron Workflow

Cron should only generate files for human review.

It must not submit FPL changes.

## Suggested Schedule

```txt
Run once daily during the season.
Run more often in the final 24 hours before a deadline.
Stop using a recommendation after its deadline.
Human manager manually applies any accepted changes.
```

Future recommendation commands should read deadline times from FPL API data and refuse to generate final recommendations after the deadline unless an explicit force flag is provided.

## Example

```bash
pnpm recommend -- --gw auto
```

In Milestone 1 this command is a placeholder.
