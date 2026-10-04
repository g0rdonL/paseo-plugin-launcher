import { describe, expect, it } from "vitest";
import { effectivePlacement, launcherSettings } from "../shared/launcher";

describe("launcher placement", () => {
  it("existing settings documents (no placement) keep the sidebar-only default", () => {
    const parsed = launcherSettings.schema.parse({ overrides: [] });
    expect(parsed.placement).toEqual({ sidebar: true, workspace: false, explorer: false });
  });

  it("an empty document parses to complete defaults", () => {
    expect(launcherSettings.schema.parse({})).toEqual({
      overrides: [],
      placement: { sidebar: true, workspace: false, explorer: false },
    });
  });

  it("partial placement fills the missing switches", () => {
    const parsed = launcherSettings.schema.parse({ placement: { explorer: true } });
    expect(parsed.placement).toEqual({ sidebar: true, workspace: false, explorer: true });
  });

  it("never leaves the launcher unreachable", () => {
    expect(effectivePlacement({ sidebar: false, workspace: false, explorer: false }))
      .toEqual({ sidebar: true, workspace: false, explorer: false });
    expect(effectivePlacement({ sidebar: false, workspace: false, explorer: true }))
      .toEqual({ sidebar: false, workspace: false, explorer: true });
  });
});
