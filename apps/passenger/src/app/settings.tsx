import { LANGUAGE_NAMES, LANGUAGES, maskPhone } from '@gta/shared';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, font, space } from '../lib/theme';

export default function SettingsScreen() {
  const { t, lang, setLang } = useI18n();
  const session = useSession();
  const router = useRouter();

  return (
    <Screen>
      <Title>{t('settings.language')}</Title>
      <View style={styles.row} accessibilityRole="radiogroup">
        {LANGUAGES.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ checked: lang === code }}
            onPress={() => setLang(code)}
            style={[styles.choice, lang === code && styles.choiceOn]}
          >
            <Text style={[styles.choiceText, lang === code && styles.choiceTextOn]}>{LANGUAGE_NAMES[code]}</Text>
          </Pressable>
        ))}
      </View>

      {session?.user.phone ? (
        <>
          <Body>{t('settings.signedInAs', { phone: maskPhone(`+${session.user.phone.replace(/^\+/, '')}`) })}</Body>
          <Button label={t('settings.signOut')} variant="secondary" onPress={() => supabase.auth.signOut()} />
        </>
      ) : (
        <Button label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  choiceTextOn: { color: colors.primaryText },
});
