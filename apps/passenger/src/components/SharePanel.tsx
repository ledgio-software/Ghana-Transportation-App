import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { colors, font, radius, space } from '../lib/theme';
import { smsUrl, whatsappUrl } from '../lib/tripShare';

type Nav = { share?: (data: { text: string }) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } };

/** "Send the link to family": WhatsApp, SMS, copy, or the phone's own share menu. */
export function SharePanel({ message, link, onClose }: { message: string; link: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const nav = globalThis.navigator as unknown as Nav | undefined;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t('share.panelTitle')}</Text>
      <Option icon="logo-whatsapp" label={t('share.whatsapp')} onPress={() => Linking.openURL(whatsappUrl(message))} />
      <Option icon="chatbubble-ellipses" label={t('share.sms')} onPress={() => Linking.openURL(smsUrl(message))} />
      {nav?.clipboard && (
        <Option
          icon={copied ? 'checkmark' : 'copy'}
          label={copied ? t('share.copied') : t('share.copy')}
          onPress={() => nav.clipboard?.writeText(link).then(() => setCopied(true), () => undefined)}
        />
      )}
      {nav?.share && <Option icon="share-social" label={t('share.more')} onPress={() => nav.share?.({ text: message }).catch(() => undefined)} />}
      <Text selectable style={styles.link}>
        {link}
      </Text>
      <Pressable accessibilityRole="button" style={styles.close} onPress={onClose}>
        <Text style={styles.closeText}>{t('share.done')}</Text>
      </Pressable>
    </View>
  );
}

function Option({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.option} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  link: { fontSize: font.small, color: colors.muted },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: font.body, fontWeight: '700', color: colors.primary },
});
