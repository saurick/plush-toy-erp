import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";

export const releaseReadyYoyoosunCustomerPackage = Object.freeze({
  ...yoyoosunCustomerPackage,
  status: "release_ready",
  runtimeEnabled: true,
  sourcePolicy: Object.freeze({
    ...yoyoosunCustomerPackage.sourcePolicy,
    previewOnly: false,
    publishEnabled: true,
  }),
});
