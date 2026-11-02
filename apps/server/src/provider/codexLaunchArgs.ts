import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import { withCodexConnectionLaunchArgs } from "@t3tools/shared/codexConnection";

const T3CODE_CODEX_LAUNCH_ARGS_ENV = "T3CODE_CODEX_LAUNCH_ARGS";

/**
 * The env override replaces the instance's launch arguments; an OpenRouter connection's overrides
 * are appended either way, so the override cannot silently send OpenRouter slugs to OpenAI.
 */
export const resolveCodexLaunchArgs = (
  settings: Parameters<typeof withCodexConnectionLaunchArgs>[1],
  environment: NodeJS.ProcessEnv = process.env,
) =>
  withCodexConnectionLaunchArgs(
    environment[T3CODE_CODEX_LAUNCH_ARGS_ENV]?.trim() || settings.launchArgs.trim(),
    settings,
  );

const codexLaunchArgv = (launchArgs?: string): ReadonlyArray<string> => tokenizeCliArgs(launchArgs);

export const codexAppServerArgs = (launchArgs?: string) => [
  "app-server",
  ...codexLaunchArgv(launchArgs),
];

export const codexExecLaunchArgs = (launchArgs?: string) => {
  const args = codexLaunchArgv(launchArgs);
  const execArgs: Array<string> = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === "--strict-config" || arg.startsWith("--config=") || arg.startsWith("-c=")) {
      execArgs.push(arg);
    } else if (arg === "--config" || arg === "-c" || arg === "--enable" || arg === "--disable") {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("-")) {
        execArgs.push(arg, value);
        index++;
      }
    } else if (arg.startsWith("--enable=") || arg.startsWith("--disable=")) {
      execArgs.push(arg);
    }
  }

  return execArgs;
};
