Feature: App2

  As a user
  I want to search
  So that I can access my products
    
  @smoke @search2
  Scenario: Successful navigation - pen
    Given I navigate to the staples page
    When Wait for promomodal
    When I enter search term
    And I click the search button
    Then I should see the products page