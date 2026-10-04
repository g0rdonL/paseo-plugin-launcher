import type { PluginTheme } from "@getpaseo/plugin";
import {
  type PluginButtonContentProps,
  type PluginButtonIconProps,
  useRpc,
} from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { countsLabel, type InboxSource, launcherMarkSeen } from "../shared/inbox";
import { buildPluginSidebarRoute } from "../shared/routes";
import { getActiveInboxStore, type InboxSnapshot, toastMessage, useInbox } from "./inbox-store";
import { navigateToSidebarRoute } from "./web";

/** Announces arrivals once, from whichever mounted component sees them first. */
function useArrivalToasts(inbox: InboxSnapshot): void {
  const toast = useToast();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check whenever the inbox changes.
  useEffect(() => {
    const message = toastMessage(getActiveInboxStore()?.takeArrivals() ?? []);
    if (message) toast.show(message, { variant: "info", durationMs: 5_000 });
  }, [inbox, toast]);
}

export function InboxBellIcon({ size, color, theme }: PluginButtonIconProps) {
  const inbox = useInbox();
  useArrivalToasts(inbox);
  const counts = countsLabel(inbox.sources);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <Icon name="Bell" size={size} color={counts ? theme.colors.accent : color} />
      {counts ? (
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.accent, fontSize: 11, fontWeight: "700", flexShrink: 0 }}
        >
          {counts}
        </Text>
      ) : null}
    </View>
  );
}

export function InboxPopover({ theme, host, close }: PluginButtonContentProps) {
  const { sources } = useInbox();
  return (
    <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
      {sources.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>No notifications.</Text>
      ) : (
        <InboxSources
          sources={sources}
          theme={theme}
          hostId={host.id}
          onNavigate={close}
          limitPerSource={8}
        />
      )}
    </ScrollView>
  );
}

export function InboxSources({
  sources,
  theme,
  hostId,
  onNavigate,
  limitPerSource,
}: {
  sources: InboxSource[];
  theme: PluginTheme;
  hostId: string;
  onNavigate?: () => void;
  limitPerSource?: number;
}) {
  const markSeen = useRpc(launcherMarkSeen);
  const [clearing, setClearing] = useState<string | null>(null);
  const clear = async (pluginId: string) => {
    setClearing(pluginId);
    try {
      await markSeen({ pluginId });
      await getActiveInboxStore()?.refresh();
    } finally {
      setClearing(null);
    }
  };
  const styles = useMemo(
    () => ({
      source: { gap: 6 },
      actions: { flexDirection: "row" as const, gap: 12 },
      seen: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
      sourceHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
      },
      sourceTitle: { color: theme.colors.foreground, fontSize: 13, fontWeight: "700" as const },
      open: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      item: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surface1,
        gap: 2,
      },
      itemPressed: { opacity: 0.7 },
      itemTitle: { color: theme.colors.foreground, fontSize: 13 },
      itemDetail: { color: theme.colors.foregroundMuted, fontSize: 11 },
      more: { color: theme.colors.foregroundMuted, fontSize: 11 },
    }),
    [theme],
  );
  return (
    <>
      {sources.map((source) => {
        const shown = limitPerSource
          ? source.notifications.slice(0, limitPerSource)
          : source.notifications;
        const hidden = source.notifications.length - shown.length;
        return (
          <View key={source.pluginId} style={styles.source}>
            <View style={styles.sourceHeader}>
              <Text style={styles.sourceTitle} numberOfLines={1}>
                {source.title} · {source.notifications.length}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${source.title} notifications seen`}
                  accessibilityState={{ busy: clearing === source.pluginId }}
                  disabled={clearing !== null}
                  onPress={() => void clear(source.pluginId)}
                >
                  <Text style={styles.seen}>
                    {clearing === source.pluginId ? "Clearing…" : "Mark seen"}
                  </Text>
                </Pressable>
                {source.itemId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${source.title}`}
                    onPress={() => {
                      onNavigate?.();
                      navigateToSidebarRoute(
                        buildPluginSidebarRoute(hostId, source.pluginId, source.itemId),
                      );
                    }}
                  >
                    <Text style={styles.open}>Open</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {shown.map((notification) => (
              <Pressable
                key={notification.id}
                accessibilityRole={notification.url ? "link" : undefined}
                disabled={!notification.url}
                onPress={() => void Linking.openURL(notification.url).catch(() => {})}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              >
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {notification.title}
                </Text>
                {notification.detail ? (
                  <Text style={styles.itemDetail} numberOfLines={2}>
                    {notification.detail}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {hidden > 0 ? <Text style={styles.more}>+{hidden} more</Text> : null}
          </View>
        );
      })}
    </>
  );
}
