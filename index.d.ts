export interface JunoLintOptions {
  angular?: boolean;
  tsFiles?: string[];
  htmlFiles?: string[];
  ignores?: string[];
}

type FlatConfig = Record<string, unknown>;

interface JunoLintPlugin {
  meta?: {
    name?: string;
    version?: string;
  };
  rules: Record<string, unknown>;
}

interface JunoLintExport extends Array<FlatConfig> {
  config(options?: JunoLintOptions): FlatConfig[];
  plugin: JunoLintPlugin;
  TEMPLATE_ATTRIBUTE_ORDER: readonly string[];
  configs: {
    recommended: FlatConfig[];
    typescript: FlatConfig[];
  };
}

declare const junolint: JunoLintExport;

export = junolint;
