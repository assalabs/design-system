import * as stylex from "@stylexjs/stylex";
import {
  colors,
  fonts,
  radius,
  spacing,
} from "{{scope}}/theme/tokens.stylex.ts";
import { ThemeToggle } from "./ThemeToggle";

// Every value below is a `stylex.defineVars` reference generated from the
// design tokens: nothing on this page hardcodes a colour or a spacing step.
const styles = stylex.create({
  page: {
    minHeight: "100vh",
    paddingBlock: spacing[12],
    paddingInline: spacing[6],
    backgroundColor: colors.bgCanvas,
    color: colors.fgDefault,
    fontFamily: fonts.familySans,
  },
  shell: {
    display: "flex",
    flexDirection: "column",
    gap: spacing[8],
    maxWidth: 880,
    marginInline: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[4],
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    color: colors.accentDefault,
    fontSize: fonts.sizeSm,
    fontWeight: fonts.weightSemibold,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    marginBlockStart: spacing[2],
    fontSize: fonts.sizeXl,
    fontWeight: fonts.weightSemibold,
    lineHeight: 1.1,
  },
  lede: {
    margin: 0,
    maxWidth: "60ch",
    color: colors.fgMuted,
    fontSize: fonts.sizeLg,
    lineHeight: 1.6,
  },
  cards: {
    display: "grid",
    gap: spacing[4],
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: spacing[2],
    padding: spacing[6],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSurface,
  },
  cardTitle: {
    margin: 0,
    fontSize: fonts.sizeMd,
    fontWeight: fonts.weightSemibold,
  },
  cardBody: {
    margin: 0,
    color: colors.fgMuted,
    fontSize: fonts.sizeSm,
    lineHeight: 1.5,
  },
  action: {
    alignSelf: "flex-start",
    borderWidth: 0,
    borderRadius: radius.md,
    paddingBlock: spacing[3],
    paddingInline: spacing[6],
    backgroundColor: {
      default: colors.brandDefault,
      ":hover": colors.brandHover,
      ":active": colors.brandActive,
    },
    color: colors.fgOnBrand,
    cursor: "pointer",
    fontFamily: fonts.familySans,
    fontSize: fonts.sizeMd,
    fontWeight: fonts.weightSemibold,
  },
});

export function App() {
  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.shell)}>
        <header {...stylex.props(styles.header)}>
          <div>
            <p {...stylex.props(styles.eyebrow)}>Design tokens</p>
            <h1 {...stylex.props(styles.title)}>
              One token source, two themes.
            </h1>
          </div>
          <ThemeToggle />
        </header>

        <p {...stylex.props(styles.lede)}>
          These styles compile to atomic CSS at build time. The colours come
          from the generated StyleX variables, which carry a light value and a
          dark override, so the page follows the system appearance out of the
          box.
        </p>

        <section {...stylex.props(styles.cards)}>
          <article {...stylex.props(styles.card)}>
            <h2 {...stylex.props(styles.cardTitle)}>Edit the tokens</h2>
            <p {...stylex.props(styles.cardBody)}>
              Change a value in packages/theme/tokens, run pnpm build:theme, and
              every surface here follows.
            </p>
          </article>
          <article {...stylex.props(styles.card)}>
            <h2 {...stylex.props(styles.cardTitle)}>Contrast is checked</h2>
            <p {...stylex.props(styles.cardBody)}>
              pnpm check:theme re-asserts every declared colour pair before the
              generated output is allowed to change.
            </p>
          </article>
        </section>

        <button type="button" {...stylex.props(styles.action)}>
          Primary action
        </button>
      </div>
    </main>
  );
}
