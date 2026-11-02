"""Browser, base URL, and Allure attachments for the one pytest project.

URLs and credentials come from the environment. Do not embed them in tests.
"""

import os

import allure
import pytest
import requests


def pytest_configure(config: pytest.Config) -> None:
    override = os.environ.get("BASE_URL", "").strip()
    if override and hasattr(config.option, "base_url"):
        config.option.base_url = override.rstrip("/")


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
    }


@pytest.fixture(scope="session")
def api_url() -> str:
    url = os.environ.get("API_URL", "").strip()
    if not url:
        pytest.skip("Set API_URL to run API tests")
    return url.rstrip("/")


@pytest.fixture
def app_url(base_url: str) -> str:
    url = (base_url or os.environ.get("BASE_URL", "")).strip()
    if not url:
        pytest.skip("Set BASE_URL to run UI tests")
    return url.rstrip("/")


@pytest.fixture
def credentials() -> dict[str, str]:
    email = os.environ.get("TEST_EMAIL", "").strip()
    password = os.environ.get("TEST_PASSWORD", "").strip()
    if not email or not password:
        pytest.skip("Set TEST_EMAIL and TEST_PASSWORD to run signed-in tests")
    return {"email": email, "password": password}


@pytest.fixture
def api(api_url: str):
    """HTTP helper. Skips when API_URL is unset or the server is not accepting connections."""

    def call(method: str, path: str, **kwargs):
        if not path.startswith("/"):
            path = "/" + path
        try:
            return requests.request(method, f"{api_url}{path}", timeout=20, **kwargs)
        except requests.RequestException as exc:
            pytest.skip(f"API is not reachable at {api_url}: {exc}")

    return call


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or not report.failed:
        return
    page = item.funcargs.get("page")
    if page is None:
        return
    # The page can already be closed when the failure is reported.
    try:
        png = page.screenshot(full_page=True)
        allure.attach(png, name="screenshot", attachment_type=allure.attachment_type.PNG)
        allure.attach(page.content(), name="page source", attachment_type=allure.attachment_type.HTML)
    except Exception:
        return


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    report_dir = getattr(session.config.option, "allure_report_dir", None)
    if not report_dir:
        return
    os.makedirs(report_dir, exist_ok=True)
    base = os.environ.get("BASE_URL", "").strip() or "unset"
    api = os.environ.get("API_URL", "").strip() or "unset"
    path = os.path.join(report_dir, "environment.properties")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(f"BaseURL={base}\nApiURL={api}\nBrowser=chromium\n")
