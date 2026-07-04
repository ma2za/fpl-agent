export const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

export const FPL_ENDPOINTS = {
  bootstrapStatic: "/bootstrap-static/",
  fixtures: "/fixtures/",
  playerSummary: (playerId: number) => `/element-summary/${playerId}/`,
  liveGameweek: (gameweekId: number) => `/event/${gameweekId}/live/`,
  manager: (managerId: number) => `/entry/${managerId}/`,
  managerPicks: (managerId: number, gameweekId: number) =>
    `/entry/${managerId}/event/${gameweekId}/picks/`,
  managerHistory: (managerId: number) => `/entry/${managerId}/history/`,
  managerTransfers: (managerId: number) => `/entry/${managerId}/transfers/`
};

export function buildFplUrl(path: string, baseUrl = FPL_BASE_URL) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");

  return new URL(normalizedPath, normalizedBaseUrl).toString();
}
