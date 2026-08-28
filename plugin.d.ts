interface JunoLintPlugin {
  meta?: {
    name?: string;
    version?: string;
  };
  rules: Record<string, unknown>;
}

declare const plugin: JunoLintPlugin;

export = plugin;
