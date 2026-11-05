---
description: Use when writing a page object or a pytest file with Allure steps into automation/.
---

# Page objects and Allure pytest

The project already exists. Add files to it. Do not start a new stack.

1. List the project.
2. Read `pages/base_page.py` and any screen you will change.
3. Write the smallest page class and test that cover the case.

Page classes extend `BasePage` and keep locators on the class.
UI tests call page methods and carry `@allure.feature`, `@allure.story`, `@allure.severity`, and `@allure.title`.
API tests use the `api` fixture, the same four Allure decorators, and no page objects.

`conftest.py` already attaches a screenshot and the page source to a failed UI test, and writes `environment.properties` for the Allure report. Keep that hook if you edit the file.

Do not hardcode URLs or secrets. `app_url` and `api` read `BASE_URL` and `API_URL`.
