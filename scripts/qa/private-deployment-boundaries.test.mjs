import assert from "node:assert/strict";
import test from "node:test";

import { privateDeploymentPackageTemplate } from "../../config/private-deployment-template/templateConfig.mjs";
import { validateTemplate } from "./private-deployment-boundaries.mjs";

test("private-deployment boundaries validate the tracked reference template", () => {
  assert.doesNotThrow(() => validateTemplate(privateDeploymentPackageTemplate));
});

test("private-deployment boundaries reject tenant expansion", () => {
  assert.throws(
    () =>
      validateTemplate({
        ...privateDeploymentPackageTemplate,
        boundaries: {
          ...privateDeploymentPackageTemplate.boundaries,
          createsTenant: true,
        },
      }),
    /boundaries\.createsTenant must stay false/u,
  );
});
