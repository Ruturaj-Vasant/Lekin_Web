import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

test.describe("landing and workspace shell", () => {
  test("creates a blank problem from the landing screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Create new problem/ }).click();
    await expect(page.getByLabel("Problem name")).toHaveValue("Untitled problem");
    await expect(page.locator("details.entity-row")).toHaveCount(0);
    await expect(page.getByLabel("Dispatching rule")).toHaveValue("spt");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
  });

  test("presents the research workbench and opens the sample problem", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await page.goto("/");

    await expect(page).toHaveTitle("LEKIN - Scheduling Research Workbench");
    await expect(page.locator(".landing-nav")).toHaveCSS("height", "60px");
    await expect(page.locator(".hero")).toHaveCSS("padding-top", "72px");
    await expect(page.getByRole("heading", { name: /Build, run, and understand/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "LEKIN features" }).getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: "Open example" }).click();

    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Problem setup" })).toBeVisible();
    const problemName = page.getByLabel("Problem name");
    await expect(problemName).toHaveValue("Sample job shop");
    await problemName.fill("My scheduling experiment");
    await expect(page.locator(".project strong")).toHaveText("My scheduling experiment");
    await expect(page.locator(".breadcrumb")).toContainText("My scheduling experiment");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await expectNoBrowserErrors(errors);
  });

  test("exposes every built-in and custom algorithm choice and starts with empty result panels", async ({ page }) => {
    await openExample(page);
    const algorithm = page.getByLabel("Dispatching rule");
    await expect(algorithm).toHaveValue("spt");
    await expect(algorithm.locator("option")).toHaveCount(5);
    await expect(algorithm.locator("option")).toHaveText([
      "SPT - Shortest processing time",
      "FCFS - First come, first served",
      "EDD - Earliest due date",
      "WSPT - Weighted SPT",
      "Custom Python algorithm",
    ]);
    await expect(page.getByText("Run a schedule", { exact: true })).toBeVisible();
    await expect(page.getByText("No schedule yet", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Execution/ }).click();
    await expect(page.getByText("No execution has run.")).toBeVisible();
    await page.getByRole("tab", { name: /Validation/ }).click();
    await expect(page.getByText("No validation errors.")).toBeVisible();
  });

  test("returns to the landing screen through the LEKIN brand", async ({ page }) => {
    await openExample(page);
    await page.getByRole("button", { name: /LEKIN/ }).click();
    await expect(page.getByRole("button", { name: "Open example" })).toBeVisible();
  });

  test("supports keyboard navigation into the example", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
  });

  test("provides working About and Help guidance with project credits", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { name: "From Python library to interactive workbench" })).toBeVisible();

    await expect(page.getByRole("link", { name: "Documentation" })).toHaveCount(0);
    await expect(page.getByText(/extends the lekinpy Python scheduling library/)).toBeVisible();

    await page.getByRole("link", { name: "Help" }).click();
    await expect(page).toHaveURL(/#help$/);
    await expect(page.getByRole("heading", { name: "LEKIN Python library" })).toBeVisible();
    await expect(page.getByText("Common questions", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Browser first", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Visit the LEKIN Python page" })).toHaveAttribute("href", "https://github.com/mpinedo170/Lekin_Python");
    await expect(page.getByText("Michael Pinedo", { exact: true })).toBeVisible();
    await expect(page.getByText("Andrew Feldman", { exact: true })).toBeVisible();
    await expect(page.getByText("Ruturaj Tambe", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "mpinedo@stern.nyu.edu" })).toHaveAttribute("href", "mailto:mpinedo@stern.nyu.edu");
    await expect(page.getByRole("link", { name: "rvt2018@nyu.edu" })).toHaveAttribute("href", "mailto:rvt2018@nyu.edu");
  });

  test("clears the current workspace with the New button", async ({ page }) => {
    await openExample(page);
    await page.getByLabel("Problem name").fill("Temporary experiment");
    await page.getByLabel("Dispatching rule").selectOption("edd");
    await page.getByRole("button", { name: /New/ }).click();

    await expect(page.getByLabel("Problem name")).toHaveValue("Untitled problem");
    await expect(page.locator("details.entity-row")).toHaveCount(0);
    await expect(page.getByLabel("Dispatching rule")).toHaveValue("spt");
    await expect(page.locator(".schedule-summary article strong")).toHaveText(["-", "-", "-", "-", "-", "-", "-", "-"]);
  });

  test("keeps editing and project actions available on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openExample(page);
    await page.getByText(/^Jobs/).click();

    await expect(page.getByLabel("Problem name")).toBeVisible();
    await expect(page.getByText("J-101", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /New/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Help" })).toHaveCount(0);

    await page.getByRole("button", { name: "Collapse problem setup panel" }).click();
    await expect(page.getByRole("button", { name: "Expand problem setup panel" })).toBeVisible();
    await page.getByRole("button", { name: "Expand problem setup panel" }).click();
    await expect(page.getByLabel("Problem name")).toBeVisible();
  });
});
