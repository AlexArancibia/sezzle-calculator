import { DocsPage } from "./docs/DocsPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { Link, usePath } from "./router";

const PAGES = [
  { path: "/", label: "Calculator" },
  { path: "/docs", label: "API docs" },
];

export function App() {
  const path = usePath();
  const isDocs = path.startsWith("/docs");

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>{isDocs ? "Calculator API" : "Calculator"}</h1>
          <p className="muted">React frontend · Go REST API · PostgreSQL history</p>
        </div>
        <nav className="nav" aria-label="Main">
          {PAGES.map((page) => {
            const active = page.path === "/" ? !isDocs : isDocs;
            return (
              <Link key={page.path} to={page.path} aria-current={active ? "page" : undefined}>
                {page.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {isDocs ? <DocsPage /> : <CalculatorPage />}
    </main>
  );
}
