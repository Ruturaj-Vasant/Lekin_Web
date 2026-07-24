import { expect, type Page } from "@playwright/test";

export async function openExample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open example" }).click();
  await page.getByRole("button", { name: "Open LEKIN starter: Sample job shop" }).click();
  await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
}

export function monitorBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

export async function expectNoBrowserErrors(errors: string[]) {
  expect(errors, "unexpected browser errors").toEqual([]);
}
