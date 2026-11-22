import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Exercise the actual UI without provider charges or database credentials.
const listings = JSON.parse(await readFile(new URL("../../../data/listings.json", import.meta.url), "utf8"));
const ids = ["P001", "P002", "P005"];
const title = id => listings.find(property => property.id === id).title;
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  let calls = 0;
  await page.route("**/listings", route => route.fulfill({ json: listings }));
  await page.route("**/match", route => {
    calls++;
    return route.fulfill({ json: {
      matches: ids.map((id, index) => ({
        property: listings.find(property => property.id === id),
        reason: `Unique reason for ${id}`,
        alternative: index > 0,
      })),
      summary: "Test matching summary", clarification: null, cached: false,
    } });
  });
  await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3100"}/properties`);
  await page.locator("form input").first().fill("Find a condo in Bangkok");
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await page.getByText("Test matching summary").waitFor();
  const assertOrder = async order => {
    const expected = order.map(title);
    await page.waitForFunction(titles =>
      JSON.stringify([...document.querySelectorAll(".property-card .card-select h3")].map(el => el.textContent)) === JSON.stringify(titles),
    expected);
    assert.deepEqual(await page.locator(".property-card .card-select h3").allTextContents(), expected);
    assert.equal(await page.locator(".property-card").count(), 3);
  };
  await assertOrder(ids);
  for (const [sort, order] of [
    ["low", ["P002", "P001", "P005"]],
    ["high", ["P005", "P001", "P002"]],
    ["default", ids],
  ]) {
    await page.getByLabel("Sort properties", { exact: true }).selectOption(sort);
    await assertOrder(order);
    assert.equal(await page.getByText("Test matching summary").isVisible(), true);
    for (const id of ids) {
      const card = page.locator(".property-card").filter({
        has: page.getByRole("heading", { name: title(id), exact: true }),
      });
      const text = await card.textContent();
      assert.ok(text.includes(`Unique reason for ${id}`));
      assert.ok(text.includes(id === "P001" ? "Recommended" : "Alternative"));
    }
    assert.ok((await page.locator(".property-card.is-selected").textContent()).includes(title("P001")));
  }
  assert.equal(calls, 1);
  console.log("PASS: all three sorts preserve AI results, reasons, badges, summary and selection; one match request.");
} finally {
  await browser.close();
}
