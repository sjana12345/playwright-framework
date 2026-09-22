import { Page, Locator, expect } from "@playwright/test";

export class SearchPage {
  readonly page: Page;

  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResults: Locator;
  readonly promomodal: Locator;
  readonly closemodal: Locator;
  constructor(page: Page) {
    this.page = page;

    this.searchInput = page.getByRole("combobox", { name: "Type to Search." });
    this.searchButton = page.locator('[aria-label="search"]');
    this.searchResults = page
      .getByRole("link", { name: "Featured Products" })
      .or(page.getByRole("img", { name: "Featured Products" }))
      .first();
    this.promomodal = page.locator("#emailcapturemodal");
    this.closemodal = page.getByRole("button", { name: "Close" });
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async closePromoModal(): Promise<void> {
    try {
      await this.promomodal.waitFor({ state: "visible", timeout: 10000 });
      await this.closemodal.click();
    } catch {
      // Modal did not appear within 10s, proceed
    }
  }

  async enterSearchTerm(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  async clickSearch(): Promise<void> {
    await this.searchButton.click();
  }

  async verifySearchResults(): Promise<void> {
    await expect(this.searchResults).toBeVisible();
  }

  async verifyProductsPage(): Promise<void> {
    await this.searchResults.waitFor({ state: "visible", timeout: 10000 });
    await expect(this.searchResults).toBeVisible();
  }
}
