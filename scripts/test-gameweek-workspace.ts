import { chromium } from "playwright";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const baseUrl = argument("--url") ?? "http://localhost:3000";
const browser = await chromium.launch();

try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(`${baseUrl}/gameweeks`);
  await desktop.getByRole("heading", { name: "Gameweek workspace" }).waitFor();
  await desktop.goto(`${baseUrl}/gameweeks/3`);
  await desktop.getByText("finalized", { exact: true }).first().waitFor();
  await desktop.getByRole("heading", { name: "Evidence lineage" }).waitFor();
  await desktop.goto(`${baseUrl}/gameweeks/38`);
  await desktop.getByText("No recommendation, archive, live result, or post-mortem is available.").waitFor();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${baseUrl}/gameweeks`);
  await mobile.getByRole("heading", { name: "Season timeline" }).waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Gameweek timeline overflows the mobile viewport.");
} finally {
  await browser.close();
}
