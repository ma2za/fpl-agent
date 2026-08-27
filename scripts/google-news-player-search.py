import json
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import httpx
from google_news_api import GoogleNewsClient
from selectolax.parser import HTMLParser


def ascii_query_name(value):
    translated = value.translate(str.maketrans({"Đ": "D", "đ": "d", "Ł": "L", "ł": "l", "Ø": "O", "ø": "o"}))
    normalized = unicodedata.normalize("NFKD", translated)
    return "".join(character for character in normalized if not unicodedata.combining(character)).encode("ascii", "ignore").decode().strip()


def query_for(player):
    names = []
    for name in [player["name"], player["webName"], *player.get("aliases", [])]:
        escaped = ascii_query_name(name).replace('"', "")
        if escaped and escaped.casefold() not in [item.casefold() for item in names]:
            names.append(escaped)
    quoted = " OR ".join(f'"{name}"' for name in names)
    return f"({quoted}) Premier League football"


def search_player(player, when, max_results):
    query = query_for(player)
    try:
        with GoogleNewsClient(language="en", country="GB") as client:
            articles = client.search(query, when=when, max_results=max_results)
            for article in articles:
                google_url = article["link"]
                article["googleLink"] = google_url
                article["link"] = client.decode_url(google_url)
        return {
            "playerId": player["playerId"],
            "query": query,
            "status": "completed",
            "error": None,
            "articles": articles,
        }
    except Exception as error:
        return {
            "playerId": player["playerId"],
            "query": query,
            "status": "blocked",
            "error": str(error),
            "articles": [],
        }


def main():
    request = json.load(sys.stdin)
    if "extractUrls" in request:
        extracted = []
        with httpx.Client(follow_redirects=True, timeout=30) as client:
            for url in request["extractUrls"]:
                try:
                    response = client.get(url, headers={"User-Agent": "fpl-agent-player-intelligence/0.0.19"})
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
    players = request["players"]
    workers = max(1, min(int(request.get("workers", 8)), 16))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(
            lambda player: search_player(player, request["when"], request["maxResults"]),
            players,
        ))
    json.dump({"provider": "google-news-api:0.0.17", "results": results}, sys.stdout)


if __name__ == "__main__":
    main()
