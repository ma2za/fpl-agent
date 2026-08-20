import json
import sys

import httpx
from google_news_api import GoogleNewsClient
from selectolax.parser import HTMLParser


def query_for(player):
    names = []
    for name in [player["name"], player["webName"]]:
        escaped = name.strip().replace('"', "")
        if escaped and escaped.casefold() not in [item.casefold() for item in names]:
            names.append(escaped)
    quoted = " OR ".join(f'"{name}"' for name in names)
    return f"({quoted}) Premier League football"


def main():
    request = json.load(sys.stdin)
    if "extractUrls" in request:
        extracted = []
        with httpx.Client(follow_redirects=True, timeout=30) as client:
            for url in request["extractUrls"]:
                try:
                    response = client.get(url, headers={"User-Agent": "fpl-agent-player-intelligence/0.0.17"})
                    response.raise_for_status()
                    parser = HTMLParser(response.text)
                    for node in parser.css("script, style, nav, footer, header"):
                        node.decompose()
                    title = parser.css_first("h1") or parser.css_first("title")
                    article = parser.css_first("article") or parser.css_first("main") or parser.body
                    extracted.append(
                        {
                            "url": url,
                            "finalUrl": str(response.url),
                            "title": title.text(strip=True) if title else "",
                            "text": article.text(separator=" ", strip=True)[:12000] if article else "",
                            "error": None,
                        }
                    )
                except Exception as error:
                    extracted.append({"url": url, "finalUrl": None, "title": "", "text": "", "error": str(error)})
        json.dump({"extracted": extracted}, sys.stdout)
        return
    if "decodeUrls" in request:
        decoded = []
        with GoogleNewsClient(language="en", country="GB") as client:
            for url in request["decodeUrls"]:
                try:
                    decoded.append({"googleUrl": url, "url": client.decode_url(url), "error": None})
                except Exception as error:
                    decoded.append({"googleUrl": url, "url": None, "error": str(error)})
        json.dump({"decoded": decoded}, sys.stdout)
        return
    results = []
    with GoogleNewsClient(language="en", country="GB") as client:
        for player in request["players"]:
            query = query_for(player)
            try:
                articles = client.search(
                    query,
                    when=request["when"],
                    max_results=request["maxResults"],
                )
                for article in articles:
                    google_url = article["link"]
                    article["googleLink"] = google_url
                    article["link"] = client.decode_url(google_url)
                results.append(
                    {
                        "playerId": player["playerId"],
                        "query": query,
                        "status": "completed",
                        "error": None,
                        "articles": articles,
                    }
                )
            except Exception as error:
                results.append(
                    {
                        "playerId": player["playerId"],
                        "query": query,
                        "status": "blocked",
                        "error": str(error),
                        "articles": [],
                    }
                )
    json.dump({"provider": "google-news-api:0.0.17", "results": results}, sys.stdout)


if __name__ == "__main__":
    main()
