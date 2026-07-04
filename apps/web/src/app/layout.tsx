import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "fpl-agent",
  description: "A read-only Fantasy Premier League recommendation workspace"
};

const links = [
  { href: "/", label: "Home" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/squad", label: "Squad" },
  { href: "/methodology", label: "Methodology" },
  { href: "/postmortems", label: "Postmortems" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="topbar-inner">
              <Link className="brand" href="/">
                fpl-agent
              </Link>
              <nav className="nav" aria-label="Main navigation">
                {links.map((link) => (
                  <Link href={link.href} key={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
