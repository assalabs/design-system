export type WebAdapter = "stylex" | "css-modules" | "none";
export type NativeAdapter = "unistyles" | "none";

export type ScaffoldOptions = {
  cwd: string;
  name: string;
  scope: string;
  prefix: string;
  web?: WebAdapter;
  native?: NativeAdapter;
};

export type ScaffoldResult = {
  directory: string;
  directories: string[];
  files: string[];
};
