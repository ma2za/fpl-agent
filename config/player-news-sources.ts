export type PlayerNewsSource = {
  id: string;
  publisher: string;
  url: string;
  kind: "official" | "national" | "regional" | "specialist" | "aggregator" | "blog";
  strategy: {
    acquisition: "fetch" | "browser" | "fetch_then_browser";
    fallbackUrl?: string;
    articlePathHints: readonly string[];
    waitForNetworkIdle: boolean;
  };
};

const club = { acquisition: "fetch_then_browser", articlePathHints: ["news", "article", "team", "injury", "match"], waitForNetworkIdle: true } as const;
const publisher = { acquisition: "fetch_then_browser", articlePathHints: ["football", "sport", "news", "premier-league"], waitForNetworkIdle: false } as const;
const fetchOnly = { acquisition: "fetch", articlePathHints: ["football", "sport", "news", "premier-league"], waitForNetworkIdle: false } as const;

const PLAYER_NEWS_SOURCE_SEEDS = [
  { id: "premier-league", publisher: "Premier League", url: "https://www.premierleague.com/en/news", kind: "official", strategy: club },
  { id: "arsenal", publisher: "Arsenal", url: "https://www.arsenal.com/news", kind: "official" },
  { id: "aston-villa", publisher: "Aston Villa", url: "https://www.avfc.co.uk/news", kind: "official" },
  { id: "bournemouth", publisher: "AFC Bournemouth", url: "https://www.afcb.co.uk/news", kind: "official" },
  { id: "brentford", publisher: "Brentford", url: "https://www.brentfordfc.com/en/news", kind: "official" },
  { id: "brighton", publisher: "Brighton & Hove Albion", url: "https://www.brightonandhovealbion.com/pages/en/media-article-listing", kind: "official" },
  { id: "chelsea", publisher: "Chelsea", url: "https://www.chelseafc.com/en/news", kind: "official" },
  { id: "crystal-palace", publisher: "Crystal Palace", url: "https://www.cpfc.co.uk/news", kind: "official" },
  { id: "everton", publisher: "Everton", url: "https://www.evertonfc.com/news", kind: "official" },
  { id: "fulham", publisher: "Fulham", url: "https://www.fulhamfc.com/news", kind: "official" },
  { id: "leeds", publisher: "Leeds United", url: "https://www.leedsunited.com/en/news", kind: "official" },
  { id: "liverpool", publisher: "Liverpool", url: "https://www.liverpoolfc.com/news", kind: "official" },
  { id: "man-city", publisher: "Manchester City", url: "https://www.mancity.com/news", kind: "official" },
  { id: "man-utd", publisher: "Manchester United", url: "https://www.manutd.com/en/news", kind: "official" },
  { id: "newcastle", publisher: "Newcastle United", url: "https://www.newcastleunited.com/en/news", kind: "official" },
  { id: "nottingham-forest", publisher: "Nottingham Forest", url: "https://www.nottinghamforest.co.uk/news", kind: "official" },
  { id: "tottenham", publisher: "Tottenham Hotspur", url: "https://www.tottenhamhotspur.com/news", kind: "official" },
  { id: "sunderland", publisher: "Sunderland", url: "https://www.safc.com/news", kind: "official" },
  { id: "bbc-sport", publisher: "BBC Sport", url: "https://www.bbc.com/sport/football/premier-league", kind: "national" },
  { id: "sky-sports", publisher: "Sky Sports", url: "https://www.skysports.com/premier-league-news", kind: "national" },
  { id: "guardian", publisher: "The Guardian", url: "https://www.theguardian.com/football/premierleague", kind: "national" },
  { id: "independent", publisher: "The Independent", url: "https://www.independent.co.uk/sport/football/premier-league", kind: "national" },
  { id: "telegraph", publisher: "The Telegraph", url: "https://www.telegraph.co.uk/football/", kind: "national" },
  { id: "times", publisher: "The Times", url: "https://www.thetimes.com/sport/football", kind: "national" },
  { id: "inews", publisher: "iNews", url: "https://inews.co.uk/category/sport/football", kind: "national" },
  { id: "talksport", publisher: "talkSPORT", url: "https://talksport.com/football/premier-league/", kind: "national" },
  { id: "mirror", publisher: "Mirror Football", url: "https://www.mirror.co.uk/sport/football/news/", kind: "national" },
  { id: "express", publisher: "Daily Express", url: "https://www.express.co.uk/sport/football", kind: "national" },
  { id: "mail", publisher: "Daily Mail", url: "https://www.dailymail.co.uk/sport/football/index.html", kind: "national" },
  { id: "standard", publisher: "Evening Standard", url: "https://www.standard.co.uk/sport/football", kind: "regional" },
  { id: "men", publisher: "Manchester Evening News", url: "https://www.manchestereveningnews.co.uk/sport/football/", kind: "regional" },
  { id: "liverpool-echo", publisher: "Liverpool Echo", url: "https://www.liverpoolecho.co.uk/sport/football/", kind: "regional" },
  { id: "chronicle-live", publisher: "Chronicle Live", url: "https://www.chroniclelive.co.uk/sport/football/", kind: "regional" },
  { id: "football-london", publisher: "football.london", url: "https://www.football.london/", kind: "regional" },
  { id: "birmingham-live", publisher: "Birmingham Live", url: "https://www.birminghammail.co.uk/sport/football/", kind: "regional" },
  { id: "nottingham-post", publisher: "Nottinghamshire Live", url: "https://www.nottinghampost.com/sport/football/", kind: "regional" },
  { id: "yorkshire-evening-post", publisher: "Yorkshire Evening Post", url: "https://www.yorkshireeveningpost.co.uk/sport/football", kind: "regional" },
  { id: "bournemouth-echo", publisher: "Bournemouth Echo", url: "https://www.bournemouthecho.co.uk/sport/", kind: "regional" },
  { id: "sussex-world", publisher: "Sussex World", url: "https://www.sussexexpress.co.uk/sport/football", kind: "regional" },
  { id: "fourfourtwo", publisher: "FourFourTwo", url: "https://www.fourfourtwo.com/news", kind: "specialist" },
  { id: "football365", publisher: "Football365", url: "https://www.football365.com/news", kind: "specialist" },
  { id: "teamtalk", publisher: "TEAMtalk", url: "https://www.teamtalk.com/news", kind: "specialist" },
  { id: "ninetymin", publisher: "90min", url: "https://www.90min.com/categories/premier-league", kind: "specialist" },
  { id: "goal", publisher: "GOAL", url: "https://www.goal.com/en-gb/premier-league/2kwbbcootiqqgmrzs6o5inle5", kind: "specialist" },
  { id: "caughtoffside", publisher: "CaughtOffside", url: "https://www.caughtoffside.com/tags/premier-league/", kind: "blog" },
  { id: "hitc", publisher: "HITC Football", url: "https://www.hitc.com/en-gb/football/", kind: "blog" },
  { id: "football-insider", publisher: "Football Insider", url: "https://www.footballinsider247.com/", kind: "blog" },
  { id: "fpl-scout", publisher: "Fantasy Football Scout", url: "https://www.fantasyfootballscout.co.uk/", kind: "specialist" },
  { id: "fpl-hub", publisher: "Fantasy Football Hub", url: "https://www.fantasyfootballhub.co.uk/", kind: "specialist" },
  { id: "newsnow", publisher: "NewsNow", url: "https://www.newsnow.co.uk/h/Sport/Football/Premier+League", kind: "aggregator" }
] satisfies Array<Omit<PlayerNewsSource, "strategy"> & { strategy?: PlayerNewsSource["strategy"] }>;

const browserFirst = new Set(["premier-league", "brighton", "chelsea", "man-city", "man-utd", "tottenham", "sky-sports", "goal", "fpl-hub"]);
const fetchOnlySources = new Set(["guardian", "bbc-sport", "newsnow"]);
const fallbackUrls: Record<string, string> = {
  "bbc-sport": "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml",
  guardian: "https://www.theguardian.com/football/rss",
  mirror: "https://www.mirror.co.uk/sport/rss.xml",
  mail: "https://www.dailymail.co.uk/sport/index.rss",
  "sky-sports": "https://www.skysports.com/rss/12040",
  talksport: "https://talksport.com/football/feed/"
};

export const PLAYER_NEWS_SOURCES: PlayerNewsSource[] = PLAYER_NEWS_SOURCE_SEEDS.map((source) => ({
  ...source,
  strategy: { ...(source.strategy ?? (browserFirst.has(source.id)
    ? { ...publisher, acquisition: "browser" }
    : fetchOnlySources.has(source.id) ? fetchOnly : source.kind === "official" ? club : publisher)), fallbackUrl: fallbackUrls[source.id] }
}));
