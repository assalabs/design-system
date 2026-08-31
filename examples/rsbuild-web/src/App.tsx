import { useEffect, useState } from "react";

type ThemeName = "light" | "dark";

export function App() {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  return (
    <main>
      <div className="toolbar">
        <span>WEB OUTPUT</span>
        <button
          type="button"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          Use {theme === "light" ? "dark" : "light"} theme
        </button>
      </div>

      <section>
        <p className="eyebrow">One semantic contract</p>
        <h1>Static CSS, generated from DTCG tokens.</h1>
        <p className="lede">
          This page imports only the generated example theme CSS. Terrazzo and
          the build tooling are absent from the application runtime.
        </p>
        <div className="cards">
          <article>
            <strong>Surface</strong>
            <span>Semantic backgrounds adapt to the active theme.</span>
          </article>
          <article>
            <strong>Accessible action</strong>
            <span>Declared color pairs are validated before generation.</span>
          </article>
        </div>
        <button className="primary" type="button">
          Primary action
        </button>
      </section>
    </main>
  );
}
