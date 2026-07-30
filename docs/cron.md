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

`pnpm recommend -- --gw auto` resolves the current or next event from cached FPL data. Verification treats a passed deadline as an error unless `--force-deadline` is explicitly supplied.

## Example

```bash
pnpm recommend -- --gw auto
```

The command writes evidence for local review and does not author or submit FPL decisions.
