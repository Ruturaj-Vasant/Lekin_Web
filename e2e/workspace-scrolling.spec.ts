import { expect, test } from "@playwright/test";
import { openExample } from "./helpers";

test("scrolls the main workspace without moving the problem editor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openExample(page);
  await page.getByLabel("Dispatching rule").selectOption("custom");

  const sidebar = page.getByRole("complementary", { name: "Problem setup" });
  const canvas = page.locator(".canvas");
  const sidebarTopBefore = (await sidebar.boundingBox())?.y;

  const layout = await canvas.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: styles.overflowY,
    };
  });

  expect(layout.overflowY).toBe("auto");
  expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);

  await canvas.evaluate((element) => element.scrollTo({ top: 500 }));
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  expect((await sidebar.boundingBox())?.y).toBe(sidebarTopBefore);
  expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(0);
});
