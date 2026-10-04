import { Linking, Platform } from "react-native";

interface LauncherWindowLocation {
  assign(url: string): void;
}

declare const window: { location: LauncherWindowLocation };

const NATIVE_SCHEME = "paseo://";

export function navigateToSidebarRoute(route: string): void {
  if (Platform.OS === "web") {
    window.location.assign(route);
    return;
  }
  void Linking.openURL(`${NATIVE_SCHEME}${route}`).catch(() => {});
}
