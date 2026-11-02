"""Shared page actions. Each action is one Allure step.

Screen classes own the locators and call these methods. Tests never see a locator.
"""

import re

import allure
from playwright.sync_api import Locator, Page, expect


class BasePage:
    def __init__(self, page: Page) -> None:
        self.page = page

    def open(self, url: str) -> None:
        with allure.step(f"Open {url}"):
            self.page.goto(url, wait_until="domcontentloaded", timeout=20_000)

    def click(self, locator: Locator, name: str) -> None:
        with allure.step(f"Click {name}"):
            locator.click()

    def fill(self, locator: Locator, value: str, name: str) -> None:
        # The value stays out of the step title so a password is not written into the report.
        with allure.step(f"Fill {name}"):
            locator.fill(value)

    def press(self, locator: Locator, key: str, name: str) -> None:
        with allure.step(f"Press {key} in {name}"):
            locator.press(key)

    def expect_visible(self, locator: Locator, name: str) -> None:
        with allure.step(f"{name} is visible"):
            expect(locator).to_be_visible()

    def expect_text(self, locator: Locator, text: str, name: str) -> None:
        with allure.step(f"{name} has text {text}"):
            expect(locator).to_have_text(text)

    def expect_url_contains(self, fragment: str) -> None:
        with allure.step(f"URL contains {fragment}"):
            expect(self.page).to_have_url(re.compile(re.escape(fragment)))
