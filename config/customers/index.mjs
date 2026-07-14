import { demoCustomerPackage } from "./demo/customerPackage.mjs";
import { referenceCustomerPackage } from "./reference-customer/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "./yoyoosun/customerPackage.mjs";

const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PACKAGE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-package-v[1-9][0-9]*$/u;

const customerPackageEntries = Object.freeze([
  Object.freeze(["demo", demoCustomerPackage]),
  Object.freeze(["reference-customer", referenceCustomerPackage]),
  Object.freeze(["yoyoosun", yoyoosunCustomerPackage]),
]);

const registeredPackageKeys = new Set();

const customerPackages = Object.freeze(
  Object.fromEntries(
    customerPackageEntries.map(([customerKey, customerPackage]) => {
      if (!CUSTOMER_KEY_PATTERN.test(customerKey)) {
        throw new Error(`invalid registered customer package key: ${customerKey}`);
      }
      if (customerPackage?.customerKey !== customerKey) {
        throw new Error(
          `registered customer package key mismatch: ${customerKey}`,
        );
      }
      if (
        typeof customerPackage.packageKey !== "string" ||
        !customerPackage.packageKey.startsWith(`${customerKey}-`) ||
        !PACKAGE_KEY_PATTERN.test(customerPackage.packageKey)
      ) {
        throw new Error(
          `registered customer package key is invalid: ${customerPackage.packageKey || customerKey}`,
        );
      }
      if (registeredPackageKeys.has(customerPackage.packageKey)) {
        throw new Error(
          `registered customer package key is duplicated: ${customerPackage.packageKey}`,
        );
      }
      registeredPackageKeys.add(customerPackage.packageKey);
      return [customerKey, customerPackage];
    }),
  ),
);

export function getCustomerPackage(customerKey) {
  const normalizedCustomerKey = String(customerKey || "").trim();
  return customerPackages[normalizedCustomerKey] || null;
}

export function listCustomerPackageKeys() {
  return Object.keys(customerPackages);
}
