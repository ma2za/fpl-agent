export const PREMIER_LEAGUE_2026_27_FIXTURES_URL =
  "https://www.premierleague.com/en/news/4675097/all-380-fixtures-for-202627-premier-league-season/";

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

const MIDWEEK_DAYS = new Set(["Tuesday", "Wednesday", "Thursday"]);

export type PremierLeagueFixture = {
  matchNumber: number;
  matchRound: number;
  date: string;
  dayName: string;
  localTime: string;
  timeSource: "explicit" | "default";
  homeTeam: string;
  awayTeam: string;
  broadcast: string | null;
  sourceLine: string;
};

export type PremierLeagueFixtureSource = {
  season: string;
  sourceUrl: string;
  generatedAt: string;
  fixtures: PremierLeagueFixture[];
  warnings: string[];
};

type ParsedDateLine = {
  date: string;
  dayName: string;
  year: number;
};

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#8217;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", "\"");
}

function readableLines(input: string) {
  const text = input
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");

  return decodeHtmlEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseDateLine(line: string, currentYear: number): ParsedDateLine | null {
  const match = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2}) ([A-Za-z]+)(?: (\d{4}))?$/);

  if (!match) {
    return null;
  }

  const month = MONTHS[match[3].toLowerCase()];

  if (!month) {
    return null;
  }

  const year = match[4] ? Number(match[4]) : currentYear;
  const day = match[2].padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    dayName: match[1],
    year
  };
}

function defaultKickoffTime(dayName: string, date: string) {
  if (date.endsWith("-05-30")) {
    return "16:00";
  }

  return MIDWEEK_DAYS.has(dayName) ? "20:00" : "15:00";
}

function parseFixtureLine(line: string) {
  const match = line.match(/^(?:(\d{1,2}:\d{2}) )?(.+?) v (.+?)(?: \(([^)]+)\))?\**$/);

  if (!match) {
    return null;
  }

  if (line.startsWith("*") || line.includes(" will ") || line.includes("Due to ")) {
    return null;
  }

  return {
    explicitTime: match[1] ?? null,
    homeTeam: match[2],
    awayTeam: match[3],
    broadcast: match[4] ?? null
  };
}

export function parsePremierLeagueFixturesArticle(input: {
  articleText: string;
  season: string;
  sourceUrl: string;
  generatedAt: string;
}): PremierLeagueFixtureSource {
  let currentDate: ParsedDateLine | null = null;
  let currentYear = 2026;
  const fixtures: PremierLeagueFixture[] = [];

  for (const line of readableLines(input.articleText)) {
    const dateLine = parseDateLine(line, currentYear);

    if (dateLine) {
      currentDate = dateLine;
      currentYear = dateLine.year;
      continue;
    }

    if (!currentDate) {
      continue;
    }

    const fixtureLine = parseFixtureLine(line);

    if (!fixtureLine) {
      continue;
    }

    const localTime = fixtureLine.explicitTime ?? defaultKickoffTime(currentDate.dayName, currentDate.date);

    fixtures.push({
      matchNumber: fixtures.length + 1,
      matchRound: Math.floor(fixtures.length / 10) + 1,
      date: currentDate.date,
      dayName: currentDate.dayName,
      localTime,
      timeSource: fixtureLine.explicitTime ? "explicit" : "default",
      homeTeam: fixtureLine.homeTeam,
      awayTeam: fixtureLine.awayTeam,
      broadcast: fixtureLine.broadcast,
      sourceLine: line
    });
  }

  const warnings = fixtures.length === 380 ? [] : [`Expected 380 fixtures from official article, parsed ${fixtures.length}.`];

  return {
    season: input.season,
    sourceUrl: input.sourceUrl,
    generatedAt: input.generatedAt,
    fixtures,
    warnings
  };
}

function teamsInFixtures(fixtures: PremierLeagueFixture[]) {
  return [...new Set(fixtures.flatMap((fixture) => [fixture.homeTeam, fixture.awayTeam]))].sort((a, b) => a.localeCompare(b));
}

function roundFixtures(source: PremierLeagueFixtureSource, gameweek: number, horizon: number) {
  const finalGameweek = gameweek + horizon - 1;

  return source.fixtures.filter((fixture) => fixture.matchRound >= gameweek && fixture.matchRound <= finalGameweek);
}

function formatFixture(fixture: PremierLeagueFixture) {
  const broadcast = fixture.broadcast ? ` (${fixture.broadcast})` : "";

  return `${fixture.dayName} ${fixture.date} ${fixture.localTime}: ${fixture.homeTeam} v ${fixture.awayTeam}${broadcast}`;
}

export function renderPremierLeagueFixturesMarkdown(source: PremierLeagueFixtureSource, gameweek: number, horizon: number) {
  const fixtures = roundFixtures(source, gameweek, horizon);
  const rows = teamsInFixtures(fixtures).map((team) => {
    const run = Array.from({ length: horizon }, (_, index) => {
      const round = gameweek + index;
      const fixture = fixtures.find((item) => item.matchRound === round && (item.homeTeam === team || item.awayTeam === team));

      if (!fixture) {
        return "-";
      }

      const isHome = fixture.homeTeam === team;
      const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;

      return `${opponent} (${isHome ? "H" : "A"})`;
    });

    return `| ${team} | ${run.join(" | ")} |`;
  });
  const roundSections = Array.from({ length: horizon }, (_, index) => {
    const round = gameweek + index;
    const lines = fixtures
      .filter((fixture) => fixture.matchRound === round)
      .map((fixture) => `- ${formatFixture(fixture)}`);

    return `## Match Round ${round}\n\n${lines.join("\n")}`;
  });

  return `# Premier League Fixtures: ${source.season}

Generated: ${source.generatedAt}

Source: ${source.sourceUrl}

These fixtures come from the official Premier League fixture release. FPL prices, player IDs, deadlines, and availability still need Fantasy Premier League confirmation.

## Opening Run

| Team | ${Array.from({ length: horizon }, (_, index) => `MR${gameweek + index}`).join(" | ")} |
| --- | ${Array.from({ length: horizon }, () => "---").join(" | ")} |
${rows.join("\n")}

${roundSections.join("\n\n")}
`;
}
