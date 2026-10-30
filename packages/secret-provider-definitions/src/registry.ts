import { makeSecretProviderDefinitionRegistry } from "@l7code/secret-provider-core/shared/definition";
import * as OnePassword from "@l7code/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
