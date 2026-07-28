import { describe, expect, it } from "vitest";
import { parsePremierLeagueFixturesArticle, renderPremierLeagueFixturesMarkdown } from "../src";

const article = `
Friday 21 August 2026
20:00 Arsenal v Coventry City (Sky Sports)

Saturday 22 August
12:30 Hull City v Manchester United (TNT Sports)
Everton v Crystal Palace
Ipswich Town v Sunderland
Nottingham Forest v Leeds United
17:30 Brentford v Tottenham Hotspur (Sky Sports)

Sunday 23 August
14:00 Brighton & Hove Albion v Aston Villa (Sky Sports)
14:00 Manchester City v AFC Bournemouth (Sky Sports)
16:30 Newcastle United v Liverpool (Sky Sports)

Monday 24 August
20:00 Fulham v Chelsea (Sky Sports)
`;

describe("parsePremierLeagueFixturesArticle", () => {
  it("parses dated fixtures and assigns match rounds", () => {
    const source = parsePremierLeagueFixturesArticle({
      articleText: article,
      season: "2026-27",
      sourceUrl: "https://www.premierleague.com/en/news/fixture-release",
      generatedAt: "2026-07-28T00:00:00.000Z"
    });

    expect(source.fixtures).toHaveLength(10);
    expect(source.fixtures[0]).toMatchObject({
      matchNumber: 1,
      matchRound: 1,
      date: "2026-08-21",
      localTime: "20:00",
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      broadcast: "Sky Sports"
    });
    expect(source.fixtures[2]).toMatchObject({
      localTime: "15:00",
      timeSource: "default",
      homeTeam: "Everton",
      awayTeam: "Crystal Palace"
    });
  });

  it("renders opening run markdown", () => {
    const source = parsePremierLeagueFixturesArticle({
      articleText: article,
      season: "2026-27",
      sourceUrl: "https://www.premierleague.com/en/news/fixture-release",
      generatedAt: "2026-07-28T00:00:00.000Z"
    });

    expect(renderPremierLeagueFixturesMarkdown(source, 1, 1)).toContain("Arsenal | Coventry City (H)");
  });
});
