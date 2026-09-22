import { createBdd } from 'playwright-bdd';
import { SearchPage } from '../../pages/SearchPage';
import testData from '../data/testData.json';


const { Given, When, Then } = createBdd();

Given('I navigate to the staples page', async ({ page }) => {

    const searchPage = new SearchPage(page);

    await searchPage.navigate(testData.url);
});

When(
    'Wait for promomodal',
    async ({ page }) => {

        const searchPage = new SearchPage(page);

        await searchPage.closePromoModal();
    }
);

When(
    'I enter search term',
    async ({ page }) => {

        const searchPage = new SearchPage(page);

        await searchPage.enterSearchTerm(testData.searchTerm);
    }
);


When('I click the search button', async ({ page }) => {

    const searchPage = new SearchPage(page);

    await searchPage.clickSearch();
});

Then('I should see the search results', async ({ page }) => {

    const searchPage = new SearchPage(page);

    await searchPage.verifySearchResults();
});

Then('I should see the products page', async ({ page }) => {

    const searchPage = new SearchPage(page);

    await searchPage.verifyProductsPage();
});