/**
 * command-code instance settings. Shared by the server driver and the client
 * settings form, so it holds only browser-safe schema code.
 *
 * @module provider-command-code/settings
 */
import {
  CustomModelSetting,
  makeBinaryPathSetting,
  makeProviderSettingsSchema,
} from "@l7code/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const CommandCodeSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("cmd").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the command-code binary. All command-code instances on this machine share its command-code login.",
        providerSettingsForm: { placeholder: "cmd", clearWhenEmpty: "omit" },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath"],
  },
);
export type CommandCodeSettings = typeof CommandCodeSettings.Type;
