Feature: API Testing and Response Comparison

  @api @validation
  Scenario: Validate single API response
    When I send a GET request to "https://dummyjson.com/products/1"
    Then the response status code should be 200
    And the response should contain field "title"
    And the response field "price" should be a number

  @api @comparison
  Scenario: Compare QA and Prod API responses with path and query parameters
    Given I have path parameter "pathparam" with value "1"
    And I have query parameter "level" with value "details"
    When I request QA endpoint "https://dummyjson.com/products/:pathparam"
    And I request Prod endpoint "https://dummyjson.com/products/:pathparam"
    Then the response status code should be 200
    And I compare the QA and Prod responses
    And I generate the comparison report

  @api @diff
  Scenario: Compare differing endpoints and report all differences
    When I request QA endpoint "https://dummyjson.com/products/1"
    And I request Prod endpoint "https://dummyjson.com/products/1"
    Then the response status code should be 200
    And I compare the QA and Prod responses
    And I generate the comparison report

  @api @bulk
  Scenario: Bulk API comparison from CSV dataset
    When I perform bulk API comparison using CSV "data/bulk-api-sample.csv" with QA "https://dummyjson.com/products/:pathparam?level=:level&date=:date" and Prod "https://dummyjson.com/products/1?level=:level&date=:date" at concurrency 20
    Then the bulk comparison should complete with 0 errors

