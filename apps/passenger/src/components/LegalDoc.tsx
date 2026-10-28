import { LEGAL_IS_DRAFT, type LegalDocument } from '@gta/shared';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';
import { Body, Notice, Screen } from './ui';

/** A full legal document (terms of use or privacy policy); the title is in the screen header. */
export function LegalDoc({ doc }: { doc: LegalDocument }) {
  const { t, lang } = useI18n();
  return (
    <Screen>
      <Stack.Screen options={{ title: doc.title }} />
      <Body muted>{t('legal.version', { version: doc.version, date: doc.updated })}</Body>
      {LEGAL_IS_DRAFT && <Notice tone="warning">{t('legal.draft')}</Notice>}
      {lang !== 'en' && <Notice>{t('legal.englishOnly')}</Notice>}
      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading} accessibilityRole="header">
            {section.heading}
          </Text>
          {section.blocks.map((block, i) =>
            typeof block === 'string' ? (
              <Text key={i} selectable style={styles.text}>
                {block}
              </Text>
            ) : (
              <View key={i} style={styles.list}>
                {block.map((item) => (
                  <View key={item} style={styles.item}>
                    <Text style={styles.bullet}>•</Text>
                    <Text selectable style={[styles.text, styles.itemText]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: { fontSize: font.heading, fontWeight: '700', color: colors.text, marginTop: space.sm },
  text: { fontSize: font.body, lineHeight: 24, color: colors.text },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  bullet: { fontSize: font.body, lineHeight: 24, color: colors.primary },
  itemText: { flex: 1 },
});
