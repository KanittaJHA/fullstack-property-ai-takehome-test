import type { BusinessProfile } from "../../../packages/contracts/src/domain/business-profile.js";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const texts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(text);
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (!object(value)) return false;
  return (
    [
      "business_name",
      "industry",
      "country",
      "about",
      "payment",
      "service_area",
    ].every((key) => text(value[key])) &&
    ["languages", "process", "rules"].every((key) => texts(value[key])) &&
    Array.isArray(value.products) &&
    value.products.length > 0 &&
    value.products.every(
      (product) =>
        object(product) &&
        text(product.name) &&
        text(product.good_for) &&
        text(product.saves_per_month_thb) &&
        nonnegative(product.price_thb) &&
        nonnegative(product.warranty_years) &&
        Number.isInteger(product.warranty_years),
    ) &&
    object(value.human_team) &&
    text(value.human_team.sales_contact) &&
    text(value.human_team.handover_hours)
  );
}
