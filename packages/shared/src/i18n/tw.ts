import type { Translations } from './en';

/**
 * Twi (Asante). DRAFT: must be reviewed by a native Twi speaker before release
 * (Phase 0 doc 6.4, "Twi language reviewer").
 */
export const tw: Translations = {
  'app.name': 'Ghana Transport',
  'common.loading': 'Ɛreba…',
  'common.error': 'Biribi ankɔ yie. San bɔ mmɔden.',
  'common.retry': 'San bɔ mmɔden',
  'common.offline': 'Data nni hɔ. Yɛrekyerɛ lɔre ka a wɔkoraa no {date}.',
  'common.cancel': 'Gyae',

  'search.title': 'Wo rekɔ he?',
  'search.from': 'Firi',
  'search.to': 'Kɔ',
  'search.pickStation': 'Paw gyinabea bi',
  'search.button': 'Hwehwɛ lɔre ka',
  'search.sameStation': 'Baabi a wofiri ne baabi a worekɔ nnyɛ pɛ.',

  'fare.official': 'Lɔre ka a wɔahyɛ',
  'fare.reported': 'Nea nkurɔfoɔ tuaa nnawɔtwe yi',
  'fare.lastChecked': 'Wɔhwɛɛ no awieeɛ {date}',
  'fare.none': 'Lɔre ka biara nni kwan yi so mprempren.',
  'fare.confidence.high': 'Wɔahwɛ no nnansa yi',
  'fare.confidence.medium': 'Ebia na ɛasesa',
  'fare.confidence.low': 'Ɛyɛ ka dada, hwɛ ansa na woatu kwan',
  'fare.departure.fill_and_go': 'Ɛfiri hɔ sɛ ɛyɛ ma a',
  'fare.departure.scheduled': 'Ɛfiri hɔ berɛ a wɔahyɛ',

  'check.title': 'Lɔre ka yi yɛ pɛ?',
  'check.quoted': 'Ka a wɔka sɛ tua (GH¢)',
  'check.button': 'Hwɛ',
  'check.above_normal': 'Ɛboro lɔre ka a ɛsɛ',
  'check.normal': 'Lɔre ka a ɛsɛ',
  'check.below_normal': 'Ɛba fam sen lɔre ka a ɛsɛ',
  'check.unknown': 'Yennim lɔre ka yi mprempren.',
  'check.excess': 'Ɛboro lɔre ka a ɛsɛ so {amount}',

  'auth.title': 'Kɔ mu',
  'auth.why': 'Ehia akawnt nko ara sɛ wobɛka lɔre ka. Hwehwɛ yɛ kwa a akawnt nhia.',
  'auth.phone': 'Fon nɔma',
  'auth.sendCode': 'Soma kood no',
  'auth.code': 'Kood a ɛwɔ nɔma 6',
  'auth.verify': 'Si so dua',
  'auth.invalidPhone': 'Hyɛ Ghana fon nɔma a ɛyɛ papa.',
  'auth.codeSent': 'Yɛde kood akɔma {phone}.',

  'report.button': 'Ka nea wotuaeɛ',
  'report.title': 'Ɛyɛ sɛn na wotuaeɛ?',
  'report.amount': 'Sika a wotuaeɛ (GH¢)',
  'report.when': 'Berɛ bɛn na wotuu kwan?',
  'report.today': 'Ɛnnɛ',
  'report.yesterday': 'Ɛnnora',
  'report.submit': 'Soma amaneɛbɔ no',
  'report.thanks': 'Meda wo ase! Wo amaneɛbɔ boa akwantufoɔ foforɔ.',
  'report.queued': 'Yɛakora so wɔ wo fon so. Ɛbɛkɔ berɛ a data aba.',
  'report.pending': 'Amaneɛbɔ a ɛretwɛn sɛ ɛbɛkɔ: {count}',
  'report.signInFirst': 'Kɔ mu ansa na woaka lɔre ka. SMS kood pɛ na ehia.',
  'report.invalidAmount': 'Hyɛ sika dodoɔ no, sɛ 12 anaa 12.50.',
  'report.done': 'Ɛyɛ',
  'check.report': 'Ka sɛ wɔgyee wo ka bebrebe',
  'check.reported': 'Yɛanya wo amaneɛbɔ. Meda wo ase.',

  'settings.title': 'Nhyehyɛeɛ',
  'settings.language': 'Kasa',
  'settings.signIn': 'Kɔ mu',
  'settings.signOut': 'Fi mu',
  'settings.signedInAs': 'Woakɔ mu sɛ {phone}',

  'update.required': 'Wɔmfa saa app yi nni dwuma bio. Yɛsrɛ wo, yɛ no foforɔ na woakɔ so de adi dwuma.',
  'update.button': 'Yɛ no foforɔ',
};
