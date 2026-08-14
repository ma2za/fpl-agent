import { describe, expect, it } from "vitest";
import { articleText, containsAlias, linksFromDocument, linksFromHtml, robotsAllows, visibleText } from "../../../scripts/discover-player-news";
import { PLAYER_NEWS_SOURCES } from "../../../config/player-news-sources";

describe("player-news discovery", () => {
  it("extracts crawlable links and strips executable page content", () => {
    const html = '<script>bad()</script><a href="/news/player">Player update</a><p>Available</p>';
    expect(visibleText(html)).toBe("Player update Available");
    expect(linksFromHtml(html, "https://club.example/news")).toEqual([{ url: "https://club.example/news/player", text: "Player update" }]);
  });

  it("extracts RSS items and applies longest robots allow/disallow rules", () => {
    const rss = "<rss><item><title><![CDATA[Player update]]></title><link>https://news.example/player</link></item></rss>";
    expect(linksFromDocument(rss, "https://news.example/feed.xml")).toEqual([{ url: "https://news.example/player", text: "Player update" }]);
    const robots = "User-agent: *\nDisallow: /news\nAllow: /news/public\n";
    expect(robotsAllows(robots, "/news/private")).toBe(false);
    expect(robotsAllows(robots, "/news/public/story")).toBe(true);
  });

  it("matches common and web-name aliases instead of requiring a legal name", () => {
    expect(containsAlias("Bruno Fernandes ready for Hull opener", ["B.Fernandes", "Bruno Borges Fernandes", "Bruno Fernandes"])).toBe(true);
    expect(containsAlias("Kelleher faces a fitness check", ["Caoimhín Kelleher", "Kelleher"])).toBe(true);
    expect(containsAlias("The club published a general update", ["Caoimhín Kelleher", "Kelleher"])).toBe(false);
  });

  it("isolates article content from global navigation", () => {
    const html = "<nav>Will Hughes</nav><main><article><p>Noah Okafor trained.</p></article></main><footer>Harry Wilson</footer>";
    expect(articleText(html)).toBe("Noah Okafor trained.");
  });

  it("keeps a unique, HTTPS-only source seed spanning source classes", () => {
    expect(PLAYER_NEWS_SOURCES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PLAYER_NEWS_SOURCES.map((source) => source.id)).size).toBe(PLAYER_NEWS_SOURCES.length);
    expect(PLAYER_NEWS_SOURCES.every((source) => source.url.startsWith("https://"))).toBe(true);
    expect(PLAYER_NEWS_SOURCES.every((source) => ["fetch", "browser", "fetch_then_browser"].includes(source.strategy.acquisition))).toBe(true);
    expect(PLAYER_NEWS_SOURCES.every((source) => source.strategy.articlePathHints.length > 0)).toBe(true);
    expect([...new Set(PLAYER_NEWS_SOURCES.map((source) => source.kind))]).toEqual(expect.arrayContaining(["official", "national", "regional", "specialist", "aggregator", "blog"]));
  });
});
