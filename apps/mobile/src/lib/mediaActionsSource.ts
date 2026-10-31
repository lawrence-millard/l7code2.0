import type { MediaReference } from "@l7code/client-runtime/media-reference";
import type { AssetResource, EnvironmentId, ThreadId } from "@l7code/contracts";
import type { FileBackedComposerAttachment } from "./composerImages";

export type MediaActionsSource = {
  readonly reference?: MediaReference;
  readonly name: string;
  readonly mimeType: string;
  readonly sourceIdentifier?: string;
} & (
  | { readonly uri: string }
  | { readonly attachment: FileBackedComposerAttachment }
  | {
      readonly environmentId: EnvironmentId;
      readonly threadId?: ThreadId;
      readonly resource: AssetResource;
    }
);
