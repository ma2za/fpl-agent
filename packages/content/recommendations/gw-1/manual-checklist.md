# FPL Agent Manual Checklist: GW1

## Deadline

Deadline: 2026-08-21T17:30:00Z

Do not apply this checklist after the deadline.

Data mode: official

## Transfer Recommendation

Recommended action: roll

Transfer cost: 0

Expected bank after action: £1.0

## Pick Team

Formation: 3-4-3

### Starting XI

- Caoimhín Kelleher (GKP, team 4, £5.0)
- Gabriel dos Santos Magalhães (DEF, team 1, £8.0)
- Michael Keane (DEF, team 9, £5.0)
- Lucas Digne (DEF, team 2, £4.5)
- Bukayo Saka (MID, team 1, £9.5)
- Rayan Cherki (MID, team 15, £7.5)
- Harry Wilson (MID, team 13, £6.5)
- Noah Okafor (MID, team 13, £6.0)
- Erling Haaland (FWD, team 15, £15.5)
- João Pedro Junqueira de Jesus (FWD, team 6, £7.5)
- Norberto Bercique Gomes Betuncal (FWD, team 9, £5.5)

## Captaincy

Captain: Erling Haaland (FWD, team 15, £15.5)

Vice-captain: Bukayo Saka (MID, team 1, £9.5)

## Bench Order

Bench GK: Martin Dubravka (GKP, team 19, £4.0)

1st bench: Keane Lewis-Potter (MID, team 4, £5.5)

2nd bench: Ryan Sessegnon (DEF, team 10, £4.5)

3rd bench: Djed Spence (DEF, team 19, £4.5)

## Chip

Chip recommendation: none

Manual instruction:
Only activate this chip if you agree with the recommendation.

## Risks

- Football-Data odds-report has no matched GW1 Premier League market rows, so scoring and clean-sheet assumptions are not market-checked.
- Cherki, Okafor, Beto, Digne, Sessegnon, and Lewis-Potter depend on value-role confidence rather than fully normalized predicted-lineup confidence.
- Bruno Fernandes is omitted despite being the highest projected midfielder and having first penalties/direct free kicks.
- Chelsea penalty evidence favors Palmer, so João Pedro's case is projection and lineup based rather than set-piece based.
- The squad relies on Haaland captaincy; a late Man City lineup concern would require a major pivot.

## Decision Analysis

This draft changes direction from the scrapped GW1 squad by restoring Saka and adding João Pedro while keeping Haaland, Gabriel, Cherki, and a playable bench. Bruno Fernandes is the major omission: he is a stronger pure projection than Saka, but Saka plus João Pedro costs £1.0m less than Bruno plus Calvert-Lewin, avoids triple Leeds exposure, keeps Arsenal's Coventry City home fixture, and leaves £1.0m bank.

### Squad Structure

- Premium spine: Haaland, Saka, Gabriel, and João Pedro give captaincy, Arsenal fixture access, elite defensive projection, and a strong second forward.
- Budget discipline: the squad uses £99.0m, leaving £1.0m bank for late price or team-news pivots.
- Formation: 3-4-3 starts the highest-evidence forward trio and keeps Lewis-Potter as first outfield bench.
- Club exposure: Arsenal, Man City, Leeds, Everton, Brentford, and Spurs are all at two or fewer players, so no club is maxed.

### Player Picks And Alternatives

#### Caoimhín Kelleher (GKP, team 4, £5.0)

Why picked:
- Kelleher is projected third among goalkeepers at £5.0m and has 3330 historical minutes.
- FFScout public predicted-lineup capture includes Kelleher for Brentford, so he is not just a historical-minutes pick.

Why not alternatives:
- Raya: Raya has the best goalkeeper projection and Arsenal fixture, but costs £1.0m more and would squeeze the Saka-Gabriel-Haaland-João Pedro structure.

Evidence:
- projection-summary.md
- minutes-risk-report.md
- public-evidence-report.md

#### Martin Dubravka (GKP, team 19, £4.0)

Why picked:
- Dubravka is the cheapest selected goalkeeper at £4.0m and has 3150 historical minutes.
- The second goalkeeper slot should not take budget from the XI while the first goalkeeper is playable.

Why not alternatives:
- Verbruggen: Verbruggen has strong minutes at £4.5m, but the extra £0.5m is less useful than preserving the £1.0m bank.

Evidence:
- player-pool.json
- minutes-risk-report.md
- risk-report.md

#### Gabriel dos Santos Magalhães (DEF, team 1, £8.0)

Why picked:
- Gabriel is the top projected defender at 5.8 and Arsenal open at home to Coventry City.
- Both FFScout and RotoWire public lineup captures include Gabriel, and he has 2750 historical minutes.

Why not alternatives:
- Nico O'Reilly: O'Reilly is cheaper and has Man City exposure, but Gabriel's projection, fixture, and public lineup support are stronger for GW1.

Evidence:
- projection-summary.md
- fixture-ticker.md
- public-evidence-report.md

#### Michael Keane (DEF, team 9, £5.0)

Why picked:
- Keane is a £5.0m defender with 2588 historical minutes and a strong 3.9 projection.
- Everton have the best six-week average fixture difficulty in the ticker, which supports using a value Everton defender.

Why not alternatives:
- Tarkowski: Tarkowski is a stronger Everton defender on total points, but costs £1.0m more and does not improve the squad enough to justify losing bank or an attacker.

Evidence:
- projection-summary.md
- fixture-ticker.md
- minutes-risk-report.md

#### Lucas Digne (DEF, team 2, £4.5)

Why picked:
- Digne is the highest projected available defender at £4.5m in the budget defender pool.
- He keeps the defence cheap enough to afford Saka and João Pedro while still offering set-piece-adjacent upside from corner/indirect role evidence.

Why not alternatives:
- Tyrick Mitchell: Mitchell has stronger historical minutes, but Digne has the better generated projection and more attacking-route evidence.

Evidence:
- budget-tiers.json
- set-pieces-report.md
- minutes-risk-report.md

#### Ryan Sessegnon (DEF, team 10, £4.5)

Why picked:
- Sessegnon is a playable £4.5m bench defender with 1816 historical minutes.
- He is kept on the bench because Fulham's Chelsea opener is difficult, but his price protects the squad structure.

Why not alternatives:
- Calvin Bassey: Bassey has more minutes, but Sessegnon has the better generated projection and is acceptable as second outfield bench.

Evidence:
- budget-tiers.json
- fixture-ticker.md
- minutes-risk-report.md

#### Djed Spence (DEF, team 19, £4.5)

Why picked:
- Spence is a £4.5m bench defender with 2049 historical minutes.
- He avoids using a dead £4.0m defender, which matters because the squad is meant to remain playable through early uncertainty.

Why not alternatives:
- Alex Murphy: Murphy is £0.5m cheaper, but has only 7 historical minutes and would make the bench fragile.

Evidence:
- budget-tiers.json
- minutes-risk-report.md
- risk-report.md

#### Bukayo Saka (MID, team 1, £9.5)

Why picked:
- Saka restores Arsenal attacking exposure for Coventry City at home and set-pieces-report lists him as Arsenal's high-confidence first penalty taker.
- RotoWire public lineup evidence includes Saka, and he is the vice-captain because his fixture and penalty role give a clear fallback captaincy route.

Why not alternatives:
- Bruno Fernandes: Bruno projects higher and has penalties, but Saka plus João Pedro costs £1.0m less than Bruno plus Calvert-Lewin while keeping Arsenal's best GW1 attacking fixture.

Evidence:
- projection-summary.md
- set-pieces-report.md
- fixture-ticker.md
- public-evidence-report.md

#### Rayan Cherki (MID, team 15, £7.5)

Why picked:
- Cherki is a £7.5m Man City attacker with a 5.1 projection and a high-confidence first direct-free-kick role.
- He adds Man City attacking exposure alongside Haaland without needing the £8.5m Semenyo spend.

Why not alternatives:
- Semenyo: Semenyo has stronger historical minutes and total points, but costs £1.0m more and does not beat Cherki's projection or direct-free-kick role.

Evidence:
- projection-summary.md
- set-pieces-report.md
- minutes-risk-report.md

#### Harry Wilson (MID, team 13, £6.5)

Why picked:
- Wilson is a £6.5m midfielder with a 4.8 projection and 2674 historical minutes.
- RotoWire public lineup evidence includes Harry Wilson, making him a stronger current pick than a pure projection artifact.

Why not alternatives:
- Bruno Guimarães: Bruno Guimarães has the same projection, but Newcastle open against Liverpool and Wilson has a better immediate public-lineup/fixture blend.

Evidence:
- projection-summary.md
- fixture-ticker.md
- public-evidence-report.md

#### Noah Okafor (MID, team 13, £6.0)

Why picked:
- Okafor is a £6.0m midfielder with a 4.7 projection, which is strong for the price.
- He keeps the midfield affordable enough to carry Saka, Cherki, Haaland, João Pedro, and Gabriel together.

Why not alternatives:
- Gibbs-White: Gibbs-White has more secure minutes and a strong role, but costs £2.0m more and would force a major downgrade elsewhere.

Evidence:
- projection-summary.md
- budget-tiers.json
- minutes-risk-report.md

#### Keane Lewis-Potter (MID, team 4, £5.5)

Why picked:
- Lewis-Potter is first outfield bench because he is the best projected sub-£5.6m midfielder and has 1960 historical minutes.
- His high-confidence direct-free-kick role gives him more emergency upside than a defensive bench-only slot.

Why not alternatives:
- Aaronson: Aaronson is close on price and minutes, but Lewis-Potter has the better generated projection and set-piece route.

Evidence:
- budget-tiers.json
- set-pieces-report.md
- minutes-risk-report.md

#### Erling Haaland (FWD, team 15, £15.5)

Why picked:
- Haaland is the highest selected projection and set-pieces-report lists him as Man City's high-confidence first penalty taker.
- Public predicted-lineup evidence includes him, and his captaincy profile is clearer than spreading funds into a no-Haaland build.

Why not alternatives:
- No-Haaland balanced structure: A no-Haaland structure improves budget spread, but removes the cleanest captaincy option and increases reliance on weaker captain alternatives.

Evidence:
- projection-summary.md
- set-pieces-report.md
- public-evidence-report.md
- captain-candidates.json

#### João Pedro Junqueira de Jesus (FWD, team 6, £7.5)

Why picked:
- João Pedro is the second-highest forward projection after Haaland and has 2658 historical minutes.
- Both FFScout and RotoWire public lineup captures include him, which supports starting him despite Chelsea's penalty hierarchy favoring Palmer.

Why not alternatives:
- Watkins: Watkins is reliable and has strong minutes, but João Pedro projects higher and is £0.5m cheaper.

Evidence:
- projection-summary.md
- minutes-risk-report.md
- public-evidence-report.md

#### Norberto Bercique Gomes Betuncal (FWD, team 9, £5.5)

Why picked:
- Beto is the best-projected £5.5m forward in the evidence pack and helps fund the premium core.
- FFScout public lineup evidence includes Beto, reducing the risk that the pick is purely historical.

Why not alternatives:
- Calvert-Lewin: Calvert-Lewin has Leeds penalty evidence, but costs £0.5m more and would reduce the bank while projecting lower than Beto.

Evidence:
- projection-summary.md
- public-evidence-report.md
- minutes-risk-report.md

### Captaincy Comparison

Why captain:
- Haaland has the highest selected projection and the clearest goal-heavy captaincy profile.
- He has high-confidence penalty evidence, strong historical minutes, and public predicted-lineup support.

Why not alternatives:
- Saka: Saka is vice-captain because Arsenal have Coventry City at home and he has penalties, but Haaland still has the better scoring profile and selected projection.
- João Pedro: João Pedro has public lineup support and a strong projection, but lacks first-penalty evidence at Chelsea.
- Cherki: Cherki has direct-free-kick upside, but his minutes are less secure than Haaland's and he is behind Haaland for Man City captaincy.

Evidence:
- captain-candidates.json
- projection-summary.md
- set-pieces-report.md
- public-evidence-report.md

### Key Omissions

- Bruno Fernandes: Bruno is omitted because the Saka plus João Pedro structure matches the Bruno plus Calvert-Lewin projection, saves £1.0m, avoids triple Leeds exposure, and keeps Arsenal attacking coverage. Reconsider if: Man Utd public evidence becomes materially stronger than Arsenal and Chelsea evidence. Late team news weakens Saka or João Pedro.
- Raya: Raya is omitted because Gabriel and Saka already give double Arsenal exposure, and spending £6.0m on goalkeeper would reduce squad flexibility. Reconsider if: A cheaper outfield structure frees £1.0m without losing Saka, Gabriel, Haaland, or João Pedro.
- Semenyo: Semenyo is omitted because Cherki is £1.0m cheaper, has the better projection in the evidence pack, and owns the first direct-free-kick role. Reconsider if: Predicted-lineup evidence weakens Cherki or public odds eventually favor Semenyo's attacking role.

## What Would Change This Recommendation

- Any selected player appears as risk or avoid in a refreshed team-news report.
- Late public predicted-lineup evidence removes Saka, Gabriel, João Pedro, Haaland, Wilson, Kelleher, Beto, or Cherki from expected XIs.
- Matched GW1 odds rows strongly favor Bruno/Man Utd over Saka/Arsenal or João Pedro/Chelsea.
- A legal Bruno structure keeps Saka or Gabriel, avoids dead bench players, and preserves at least £0.5m bank.
- FPL price, position, or availability changes alter the £99.0m structure before deadline.

## Final Human Confirmation

Before applying manually, check:

- Player flags
- Deadline has not passed
- Starting XI is legal
- Captain and vice-captain are correct
- Bench order is correct
- Chip selection is intentional
