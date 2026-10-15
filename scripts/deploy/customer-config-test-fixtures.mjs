import { yoyoosunReleasePackage as releaseReadyYoyoosunCustomerPackage } from "../../config/customers/yoyoosun/releasePackage.mjs";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";

export { releaseReadyYoyoosunCustomerPackage };
export const releaseReadyYoyoosunRevision = buildRuntimeManifest(
  releaseReadyYoyoosunCustomerPackage,
).revision;
