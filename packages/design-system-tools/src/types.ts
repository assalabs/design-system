export type ContrastPair = {
  foreground: string;
  background: string;
  minimum: number;
  description?: string;
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
