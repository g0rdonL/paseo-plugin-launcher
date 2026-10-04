import { useSettings } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { launcherSettings, type Placement } from "../shared/launcher";
import { applyPlacement } from "./placement";

const OPTIONS: { key: keyof Placement; label: string; hint: string }[] = [
  { key: "sidebar", label: "Left sidebar", hint: "A Plugins row in the sidebar." },
  { key: "workspace", label: "Centre tab", hint: "A Plugins tab beside agents and terminals." },
  { key: "explorer", label: "Right panel", hint: "A Plugins panel in the Explorer." },
];

/** Where the launcher appears. Saves immediately and applies without a plugin reload. */
export function PlacementSettings() {
  const settings = useSettings(launcherSettings);
  if (settings.status !== "ready") return null;
  const { placement } = settings.values;
  const enabledCount = OPTIONS.filter((option) => placement[option.key]).length;

  const toggle = async (key: keyof Placement, value: boolean) => {
    const next = { ...placement, [key]: value };
    const saved = await settings.save({ ...settings.values, placement: next }, settings.revision);
    if (saved) applyPlacement(next);
  };

  return (
    <SettingsSection title="Placement">
      <SettingsCard>
        {OPTIONS.map((option) => (
          <SettingsSwitch
            key={option.key}
            label={option.label}
            hint={option.hint}
            value={placement[option.key]}
            // Keep at least one placement so the launcher can't disappear.
            disabled={settings.saving || (placement[option.key] && enabledCount === 1)}
            onValueChange={(value) => void toggle(option.key, value)}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}
