import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";

export function ThreadListAppearanceSection() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferences);

  return (
    <SettingsSection title="Thread list">
      <SettingsSwitchRow
        disabled={!loaded}
        icon="pin"
        label="Pinned section headers"
        subtitle="Label the Pinned and Active threads while any thread is pinned."
        value={loaded && preferences.value.pinnedSectionHeadersEnabled !== false}
        onValueChange={(value) => savePreferences({ pinnedSectionHeadersEnabled: value })}
      />
    </SettingsSection>
  );
}
