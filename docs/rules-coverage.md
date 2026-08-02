# FPL Rules Coverage

The rules package models the 2026/27 FPL rules needed to validate and score an authored recommendation. Existing season-neutral validators remain supported.

## Covered

- 15-player squad size.
- Position structure: 2 GKP, 5 DEF, 5 MID, 3 FWD.
- Maximum 3 players per club.
- Starting XI size and valid formations.
- Bench order membership.
- Captain and vice-captain validity.
- Basic transfer-cost arithmetic.
- Basic chip availability.
- Deadline status.
- Exclusive competition-phase derivation with deadline proximity kept separate.
- Phase-valid action vocabularies for preseason, live gameweeks, transfer windows, final lockdown, and season completion.
- Rejection of transfer-window actions such as `roll` during preseason draft construction.
- Two chip sets across the season and first-half chip expiry.
- Free Hit not available in GW1 and not playable in consecutive gameweeks.
- Roll up to five free transfers.
- Full scoring rules, including goals, assists, clean sheets, saves, cards, bonus, defensive contributions, and own goals.
- 2026/27 defensive contribution rules.
- 2026/27 Bonus Points System changes.
- Price-change mechanics and squad value/sell value.
- Automatic substitutions and captaincy fallback scoring.
- Double and blank gameweek scoring edge cases.
- Final Gameweek lockdown and post-match Opta review timing.

Season-aware APIs require the explicit `2026-27` season identifier. Unknown seasons fail clearly instead of silently reusing stale rules. Match scoring accepts official credited assists and bonus points as inputs. The package allocates bonus points from supplied BPS totals and exposes the 2026/27 BPS weights, but it does not recreate Opta event adjudication.

Score lifecycle callers supply the published lockdown timestamp. Results remain provisional after the final match until that timestamp, then become final.

## Sources

- FPL squad structure and budget: https://www.premierleague.com/en/news/2174419/fpl-basics-how-to-pick-a-squad
- FPL 2026/27 launch and rule-change summary: https://www.premierleague.com/en/news/4680722/fpl-is-live-pick-your-202627-squad-now/
- FPL 2026/27 chip structure: https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627
- FPL scoring rules: https://www.premierleague.com/en/news/2174909/fpl-basics-scoring
- FPL transfer and sell-value rules: https://www.premierleague.com/en/news/2174907/fpl-basics-making-transfers
- FPL 2026/27 defensive contributions: https://www.premierleague.com/en/news/4361991/whats-happening-with-defensive-contribution-points-in-202627-fantasy
- FPL 2026/27 Bonus Points System changes: https://www.premierleague.com/en/news/4679946/whats-new-in-202627-fantasy-changes-to-bonus-points-system
- FPL help and automatic-substitution rules: https://fantasy.premierleague.com/help/
