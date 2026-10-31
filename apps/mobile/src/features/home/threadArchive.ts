import {
  threadRuntimeCanArchive,
  type ThreadRuntimeSummary,
} from "@l7code/client-runtime/state/models";

export function threadCanArchive(runtime: ThreadRuntimeSummary | null | undefined): boolean {
  return threadRuntimeCanArchive(runtime);
}
