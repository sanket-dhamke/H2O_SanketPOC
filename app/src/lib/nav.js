// Cross-tab jumps reset the nested stack to [tab root, target] so Back never
// lands on a leftover screen (the usual offender is Emergency SOS).

const TAB_ROOTS = {
  Community: "CommunityHome",
  Maintenance: "MaintenanceHome",
  Visitors: "VisitorsHome",
  Finance: "FinanceHome",
  Members: "ManageUsers",
};

export function openScreen(navigation, route, params) {
  if (!navigation || !route) return;
  const screen = params?.screen;
  const screenParams = params?.params;
  const root = TAB_ROOTS[route];

  if (root && screen && screen !== root) {
    navigation.navigate(route, {
      state: {
        routes: [{ name: root }, { name: screen, params: screenParams }],
        index: 1,
      },
    });
    return;
  }
  if (root && (!screen || screen === root)) {
    navigation.navigate(route, {
      state: { routes: [{ name: root }], index: 0 },
    });
    return;
  }
  if (screen) {
    navigation.navigate(route, { screen, params: screenParams });
    return;
  }
  navigation.navigate(route, params);
}

export function backToRoot(navigation, rootName) {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  if (rootName) navigation.navigate(rootName);
}
