export type WebAdapter = "stylex" | "css-modules" | "none";
export type NativeAdapter = "unistyles" | "none";
export type Template = "expo" | "web" | "none";
export type Bundler = "rsbuild" | "vite";

export type ScaffoldOptions = {
  cwd: string;
  name: string;
  scope: string;
  prefix: string;
  template: Template;
  bundler: Bundler;
  brand: string;
  neutral?: string;
  accent?: string;
  web?: WebAdapter;
  native?: NativeAdapter;
};

export type ScaffoldResult = {
  directory: string;
  directories: string[];
  files: string[];
};
