import { yoyoosunCustomerPackage } from "./customerPackage.mjs";

// The raw package remains reviewable and preview-only. This explicit projection is
// the only tracked input allowed to enter the formal manifest release path.
export const yoyoosunReleasePackage = Object.freeze({
  ...yoyoosunCustomerPackage,
  status: "release_ready",
  runtimeEnabled: true,
  sourcePolicy: Object.freeze({
    ...yoyoosunCustomerPackage.sourcePolicy,
    previewOnly: false,
    publishEnabled: true,
    localTestApplyEnabled: false,
  }),
});
