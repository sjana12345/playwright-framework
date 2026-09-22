import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { ApiClient, ApiResponseData } from '../../utils/api/apiClient';
import { ApiComparator, ComparisonResult } from '../../utils/api/apiComparator';
import { ApiReporter } from '../../utils/api/apiReporter';

const { Given, When, Then } = createBdd();

let pathParams: Record<string, string | number> = {};
let queryParams: Record<string, string | number | boolean> = {};
let lastResponse: ApiResponseData | undefined;
let qaResponse: ApiResponseData | undefined;
let prodResponse: ApiResponseData | undefined;
let comparisonResult: ComparisonResult | undefined;

const apiClient = new ApiClient();

// Setup Parameters
Given('I have path parameter {string} with value {string}', async ({}, key: string, value: string) => {
  pathParams[key] = value;
});

Given('I have query parameter {string} with value {string}', async ({}, key: string, value: string) => {
  queryParams[key] = value;
});

// Single API Execution
When('I send a GET request to {string}', async ({}, urlTemplate: string) => {
  lastResponse = await apiClient.get(urlTemplate, { pathParams, queryParams });
});

// Comparison Endpoints Execution
When('I request QA endpoint {string}', async ({}, urlTemplate: string) => {
  qaResponse = await apiClient.get(urlTemplate, { pathParams, queryParams });
  lastResponse = qaResponse;
});

When('I request Prod endpoint {string}', async ({}, urlTemplate: string) => {
  prodResponse = await apiClient.get(urlTemplate, { pathParams, queryParams });
  lastResponse = prodResponse;
});

// Response Validations
Then('the response status code should be {int}', async ({}, expectedStatus: number) => {
  expect(lastResponse).toBeDefined();
  expect(lastResponse!.status).toBe(expectedStatus);
});

Then('the response should contain field {string}', async ({}, fieldName: string) => {
  expect(lastResponse).toBeDefined();
  expect(lastResponse!.body).toHaveProperty(fieldName);
});

Then('the response field {string} should be a number', async ({}, fieldName: string) => {
  expect(lastResponse).toBeDefined();
  const value = lastResponse!.body[fieldName];
  expect(typeof value).toBe('number');
});

Then('the response field {string} should equal {string}', async ({}, fieldName: string, expectedValue: string) => {
  expect(lastResponse).toBeDefined();
  const actualValue = String(lastResponse!.body[fieldName]);
  expect(actualValue).toBe(expectedValue);
});

// Comparison and Reporting
Then('I compare the QA and Prod responses', async ({}) => {
  expect(qaResponse).toBeDefined();
  expect(prodResponse).toBeDefined();

  comparisonResult = ApiComparator.compare(qaResponse!.body, prodResponse!.body);
});

Then('I compare the QA and Prod responses ignoring {string}', async ({}, ignoreFieldsList: string) => {
  expect(qaResponse).toBeDefined();
  expect(prodResponse).toBeDefined();

  const ignoreFields = ignoreFieldsList.split(',').map((f) => f.trim());
  comparisonResult = ApiComparator.compare(qaResponse!.body, prodResponse!.body, { ignoreFields });
});

Then('I generate the comparison report', async ({ $testInfo }) => {
  expect(comparisonResult).toBeDefined();

  const reportPath = ApiReporter.generateHtmlReport(comparisonResult!, {
    title: 'QA vs Prod API Comparison',
    qaResponse,
    prodResponse,
  });

  ApiReporter.printConsoleSummary(comparisonResult!, 'QA vs Prod API Comparison');
  console.log(`[HTML Report Generated]: ${reportPath}`);

  // Attach to Playwright HTML Report if testInfo is present
  if ($testInfo) {
    await $testInfo.attach('api-comparison-report', {
      path: reportPath,
      contentType: 'text/html',
    });
  }
});

import * as path from 'path';
import { BulkComparator, BulkComparisonResult } from '../../utils/api/bulkComparator';

let bulkResult: BulkComparisonResult | undefined;

Then('the QA and Prod responses should match', async ({}) => {
  expect(comparisonResult).toBeDefined();
  expect(comparisonResult!.isMatch).toBe(true);
});

// Bulk Comparison Steps
When(
  'I perform bulk API comparison using CSV {string} with QA {string} and Prod {string} at concurrency {int}',
  async ({ $testInfo }, csvPath: string, qaTemplate: string, prodTemplate: string, concurrency: number) => {
    const comparator = new BulkComparator();
    bulkResult = await comparator.execute({
      csvFilePath: path.resolve(process.cwd(), csvPath),
      qaUrlTemplate: qaTemplate,
      prodUrlTemplate: prodTemplate,
      concurrency,
      reportTitle: 'bdd-bulk-comparison',
    });

    if ($testInfo) {
      await $testInfo.attach('bulk-dashboard', {
        path: bulkResult.htmlReportPath,
        contentType: 'text/html',
      });
      await $testInfo.attach('bulk-results-csv', {
        path: bulkResult.csvLogPath,
        contentType: 'text/csv',
      });
    }
  }
);

Then('the bulk comparison should complete with {int} errors', async ({}, expectedErrors: number) => {
  expect(bulkResult).toBeDefined();
  expect(bulkResult!.stats.errors).toBe(expectedErrors);
});


