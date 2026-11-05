import allure


@allure.feature("Framework")
@allure.story("Allure report")
@allure.severity(allure.severity_level.TRIVIAL)
@allure.title("Allure collects a named step")
def test_allure_collects_a_step():
    with allure.step("Record a step in the report"):
        assert True
