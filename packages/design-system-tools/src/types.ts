export type ContrastPair = {
  foreground: string;
  background: string;
  minimum: number;
  description?: string;
};

/** StyleX adapter output. `file` is relative to the theme package root. */
export type StylexOutput = {
  file: string;
};

/**
 * Unistyles adapter output. `dir` is relative to the theme package root and must
 * contain the directory of `outputs.native`, because the generated Unistyles
 * module imports the native themes file with a relative specifier.
 */
export type UnistylesOutput = {
  dir: string;
  /**
   * Token id read for the Unistyles `spacing()` base step.
   * Defaults to `dimension.space.base`.
   */
  spacingBaseToken?: string;
};

export type DesignSystemConfig = {
  name: string;
  prefix: string;
  source: string;
  themes: readonly string[];
  defaultTheme: string;
  themeModifier?: string;
  outputs: {
    css?: string;
    native?: string;
    tokenNames?: string;
    stylex?: StylexOutput;
    unistyles?: UnistylesOutput;
  };
  requiredTokens?: readonly string[];
  contrastPairs?: readonly ContrastPair[];
};

export type LoadedDesignSystemConfig = {
  config: DesignSystemConfig;
  configPath: string;
  rootDirectory: string;
};

export type GeneratedOutput = {
  filename: string;
  contents: string | Buffer;
};
