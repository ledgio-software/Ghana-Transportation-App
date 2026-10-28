/**
 * The full Terms of Use and Privacy Policy (P1-LEGAL), shown in the app at /terms and
 * /privacy-policy and exported to docs/legal for the lawyer (scripts/build-legal-docs.ts).
 *
 * DRAFT written against what the app actually does and Ghana's Data Protection Act, 2012
 * (Act 843). It is not legal advice: a Ghanaian lawyer must review it before launch. When the
 * text changes, bump LEGAL_VERSIONS so everyone is asked to agree again.
 */
import { LEGAL_VERSIONS } from './legal';

/** The company details the documents name. Fill in once known; brackets mark what is missing. */
export const LEGAL_ENTITY = {
  name: '[Company name]',
  address: '[Registered address], Accra, Ghana',
  email: '[privacy@your-domain.com]',
  dpcRegistration: '[DPC registration number]',
  /** Supabase → Project settings → General shows it. */
  dataRegion: '[database region, for example Europe (Frankfurt)]',
  website: 'https://ghana-transportation-app-passenger.vercel.app',
} as const;

export type LegalEntity = { [K in keyof typeof LEGAL_ENTITY]: string };

/** Date of the current text, shown as "Last updated". */
export const LEGAL_UPDATED = '29 October 2026';

/** True until the lawyer approves the text; the app then stops showing the draft notice. */
export const LEGAL_IS_DRAFT = true;

/** A paragraph, or a list of bullet points. */
export type LegalBlock = string | readonly string[];

export interface LegalSection {
  heading: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  title: string;
  version: string;
  updated: string;
  sections: readonly LegalSection[];
}

export function privacyPolicy(e: LegalEntity = LEGAL_ENTITY): LegalDocument {
  return {
    title: 'Privacy Policy',
    version: LEGAL_VERSIONS.privacy,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: '1. Who we are',
        blocks: [
          `Ghana Transport ("the app") is run by ${e.name}, ${e.address} ("we", "us"). We are the data controller for the personal data described here, and we are registered with the Data Protection Commission of Ghana (registration number ${e.dpcRegistration}).`,
          `This policy explains what personal data we collect, why, who sees it, how long we keep it and your rights under the Data Protection Act, 2012 (Act 843). It covers the Android app, the website and iPhone home-screen app at ${e.website}, and the "follow a trip" page that family open from a shared link.`,
          `Questions or requests: ${e.email}.`,
        ],
      },
      {
        heading: '2. Using the app without an account',
        blocks: [
          'You can search fares, see routes, maps and weather, use the live map and Traffic home, call emergency numbers and share a trip without an account. We do not ask who you are for any of this.',
          'To send reports or get fare-change alerts, you sign in with your phone number and agree to these documents.',
        ],
      },
      {
        heading: '3. What we collect and why',
        blocks: [
          [
            'Phone number: to sign you in with a one-time SMS code, and to limit fake or repeated reports. Other users never see it.',
            'Name and home city: only if you add them in Settings. They are optional.',
            'Your choices: language, whether you want news about new features, and a record of when you agreed to which version of these documents (the law requires us to be able to show this).',
            'Fare reports: the route, what you paid, the vehicle type and the day you travelled. Used to show what people paid recently.',
            'Overcharging and short-drop reports: the route, the amount asked, the usual fare, and the vehicle plate and a note if you add them. Used to warn other passengers and to show our staff where overcharging happens.',
            'Driver reports and ratings: what happened, the vehicle plate, the route, a note, the time, your star rating and up to 3 photos of the vehicle. Used to review the report and, where needed, pass it to the authorities (see section 5).',
            'Saved trips and fare-change alerts: the trips you save and the alerts we send you about them.',
            'Your location: on your phone only, to show where you are on the live map and how far you have left. We do not store it, except when you share a trip (below).',
            'Traffic home: the place you set as home is saved on your phone only. When you check the traffic, your current position and your home, rounded to about 100 metres, are sent through our servers to Google to work out the drive time. We do not save them; our servers keep the answer for up to 5 minutes so nearby requests can share it, and hosting logs may record the request for a short time.',
            'Shared trips: when you tap "Share my trip", the two stations, the time, and your latest position while the live map is open. A shared trip is not linked to your account or phone number.',
            'Technical data: your IP address, browser or phone type and app version, kept in our hosting providers\' logs for security and to fix faults.',
          ],
          'We do not collect your contacts, ID numbers or payment details. We do not use advertising or tracking tools, and we never sell your data.',
          'Some data is kept on your phone so the app works without network: stations, fares you looked up, saved trips, your recent trips (until you clear them in My trips) and reports waiting to be sent. Deleting the app (or clearing the website\'s data in your browser) removes it.',
        ],
      },
      {
        heading: '4. Our legal reasons for using your data',
        blocks: [
          [
            'Your consent: reports, photos, location, sharing a trip and news about new features. You can withdraw consent at any time (section 8); this does not affect what was done before.',
            'Providing the service you asked for: signing you in, saving your trips and sending you fare-change alerts.',
            'Legitimate interests: keeping fares accurate, stopping fake reports and abuse, and keeping the app secure. We balance these against your rights.',
            'Legal obligations: when Ghanaian law or a court order requires us to keep or share data.',
          ],
        ],
      },
      {
        heading: '5. Who sees your data',
        blocks: [
          [
            'Other passengers: only combined figures, such as what people paid this week. Never your name or phone number.',
            'Our staff: trained staff review reports, driver reports and photos. They sign in with two-step verification, and changes they make are logged.',
            'Authorities and operators: when a driver report needs action, our staff may pass it to the Police Motor Traffic and Transport Directorate (MTTD), the National Road Safety Authority (NRSA) or the transport operator or union. We share what happened, the plate, the route, the time, your note and the photos, but not your name or phone number, unless you agree or the law requires it.',
            'People you share a trip with: anyone who has your link sees your trip and latest position until sharing ends.',
            'Service providers who process data for us under contract: Supabase (database, sign-in and photo storage), Vercel (website and web services), our SMS provider (sends sign-in codes; during testing this is SMSGate, which sends them from a phone we control through its cloud service), Google Maps Platform (maps and road routes) and MET Norway (weather forecasts). When you open a map, your phone connects to Google, which receives your IP address; Google\'s privacy policy (https://policies.google.com/privacy) applies to that. Weather and road routes are fetched by our servers with the stations\' positions only, not your identity; for Traffic home, our servers send Google your rounded position and home, without your identity.',
            'When the law requires: we share data if Ghanaian law, a court order or a lawful request from the authorities requires it.',
          ],
        ],
      },
      {
        heading: '6. Where your data is stored',
        blocks: [
          'Our servers are run by Supabase and Vercel and are located outside Ghana (the database is in ${e.dataRegion}). We use providers with strong security and contracts that protect your data, and we transfer data only as Act 843 allows.',
        ],
      },
      {
        heading: '7. How long we keep it',
        blocks: [
          [
            'Your account (phone number, name, home city, settings, consent records, saved trips): until you delete your account.',
            'Fare, overcharging, hazard and driver reports and ratings: after 90 days we remove the link to you and the vehicle plate. The report itself may be kept without them, to show fare history and trends.',
            'Photos with driver reports: deleted after 90 days.',
            'Fare-change alerts: 90 days.',
            'Shared trips: your position is cleared as soon as sharing stops (you stop it, you arrive, or after 6 hours). The shared trip itself is deleted within about two days of when you started sharing.',
            'Hosting logs: kept by our providers for a short time, usually days to a few weeks.',
          ],
          'When you delete your account, we delete your personal data straight away. Reports you sent stay, without your name or phone number.',
        ],
      },
      {
        heading: '8. Your rights',
        blocks: [
          'Under Act 843 you have the right to:',
          [
            'Know what data we hold about you and get a copy: Settings → Privacy → "Download my data".',
            'Correct it: Settings → Privacy → "Your details", or email us.',
            'Have it deleted: Settings → Privacy → "Delete my account".',
            'Withdraw consent or object: turn off news about new features in Settings, stop sharing a trip, turn off location for the app in your phone\'s settings, or email us.',
            'Complain to the Data Protection Commission of Ghana (https://www.dataprotection.org.gh) if you think we have not handled your data properly. We would like the chance to put it right first.',
          ],
          `For anything you cannot do in the app, email ${e.email}. We may ask you to confirm your phone number so we do not give your data to someone else. We will reply as soon as we can, within the time the law allows.`,
        ],
      },
      {
        heading: '9. How we protect your data',
        blocks: [
          'All connections are encrypted (HTTPS). Database rules let each person see only their own data. Staff need two-step verification, report photos are private and shown to staff through links that expire after 10 minutes, and the secret that controls a shared trip is stored only in scrambled form. No system is perfectly secure; if a breach puts your data at risk, we will tell the Data Protection Commission and you as the law requires.',
        ],
      },
      {
        heading: '10. Children',
        blocks: [
          'You must be 18 or older to create an account and send reports. Anyone can search fares without an account. If you believe a child has given us personal data, contact us and we will delete it.',
        ],
      },
      {
        heading: '11. Changes to this policy',
        blocks: [
          'We will tell you in the app when this policy changes. For important changes we will ask you to agree again before you send more reports. The version and date are at the top of this page.',
        ],
      },
      {
        heading: '12. Contact us',
        blocks: [`${e.name}, ${e.address}. Email: ${e.email}.`],
      },
    ],
  };
}

export function termsOfUse(e: LegalEntity = LEGAL_ENTITY): LegalDocument {
  return {
    title: 'Terms of Use',
    version: LEGAL_VERSIONS.terms,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: '1. About these terms',
        blocks: [
          `These terms are an agreement between you and ${e.name}, ${e.address} ("we", "us"), for the Ghana Transport app, website and iPhone home-screen app ("the app"). By using the app you accept these terms. Before you send reports, the app asks you to agree to them and to our Privacy Policy.`,
        ],
      },
      {
        heading: '2. What the app does',
        blocks: [
          'The app helps you plan trips in Ghana: fares between stations, routes and maps, estimated travel times, weather along the way, saved trips and fare-change alerts, emergency numbers, reporting and rating drivers, and sharing your trip with family.',
          'The app is free. Your mobile network may charge for data and SMS.',
          'We do not sell tickets or run any transport. Drivers, operators, unions and stations are independent of us, and we are not responsible for their services or conduct.',
        ],
      },
      {
        heading: '3. Fares and travel information are a guide',
        blocks: [
          [
            'Official fares come from operators, unions and regulators and may change without notice. Each fare shows when it was last checked.',
            '"People paid this week" is what other passengers reported. It is not an official price.',
            'Travel times, weather forecasts, flood warnings and maps are estimates. Maps and road routes come from Google; weather comes from MET Norway.',
            'Saved information on your phone may be out of date when you have no network. The app tells you when it is showing saved information.',
          ],
          'Always confirm the fare with the driver or station before you travel. We are not responsible for a fare you agree to pay, a missed trip or a delay.',
        ],
      },
      {
        heading: '4. Emergencies',
        blocks: [
          'The app is not an emergency service. If anyone is in danger or hurt, call 112 straight away.',
          'Reporting a driver in the app does not alert the police. Our staff review reports and may pass them to the MTTD, the NRSA or the operator, but we cannot promise that any action will be taken or how quickly.',
        ],
      },
      {
        heading: '5. Your account',
        blocks: [
          [
            'Sign in only with a phone number that is yours. Never share your sign-in code.',
            'You must be 18 or older to create an account.',
            'You are responsible for what is done with your account. Tell us straight away if you think someone else is using it.',
            'You can delete your account at any time in Settings → Privacy.',
          ],
        ],
      },
      {
        heading: '6. Reports, ratings and photos',
        blocks: [
          'Your reports help other passengers, so they must be honest. When you send a report, rating or photo, you agree that:',
          [
            'It is about a real trip and is true to the best of your knowledge.',
            'It does not contain insults, threats, hate speech, or anyone\'s personal details such as names or phone numbers.',
            'Photos show the vehicle and its plate, not people\'s faces where you can avoid it. Never take photos while driving or when it is unsafe.',
            'You own the photo or have the right to share it.',
          ],
          'You keep ownership of what you send. You give us a free, non-exclusive, worldwide licence to store, use, combine and publish it (for example in fare figures, without your name or number), and to share it with the authorities and operators as described in our Privacy Policy.',
          'We may check, reject or remove any report, and limit how many reports one account can send. Sending false or abusive reports may lead to your account being suspended, and may be against the law.',
        ],
      },
      {
        heading: '7. Sharing your trip',
        blocks: [
          [
            'Share your trip link only with people you trust. Anyone with the link can see your trip and where you are until sharing ends.',
            'Your position is sent only while the live map is open on your phone. It stops when you tap "Stop sharing", when you arrive, or after 6 hours.',
            'Trip sharing depends on your phone, its battery and the network. Do not rely on it as your only safety measure.',
          ],
        ],
      },
      {
        heading: '8. Things you must not do',
        blocks: [
          [
            'Break the law or help anyone else to.',
            'Pretend to be someone else, or use someone else\'s phone number.',
            'Try to get into parts of the app, accounts or data that are not yours, or test our security without our written permission.',
            'Copy our fare data in bulk, use automated tools on the app, or put an unreasonable load on it.',
            'Interfere with the app or with other people\'s use of it.',
          ],
        ],
      },
      {
        heading: '9. Other services',
        blocks: [
          'The app uses Google Maps. By using maps in the app, you also agree to the Google Maps Terms of Service (https://maps.google.com/help/terms_maps/) and acknowledge the Google Privacy Policy (https://policies.google.com/privacy).',
          'Weather data is from MET Norway, used under its open licence (CC BY 4.0).',
          'When you send a link by WhatsApp, SMS or another app, that app\'s own terms apply.',
        ],
      },
      {
        heading: '10. Our app and content',
        blocks: [
          `The app, its design and our fare collection belong to ${e.name}. You may use them for your own travel. You may not copy, sell or republish them without our permission.`,
        ],
      },
      {
        heading: '11. Changes and availability',
        blocks: [
          'We work to keep the app available and accurate, but we may change, pause or stop parts of it, for example for maintenance or when data is no longer available.',
          'We may update these terms. We will tell you in the app, and for important changes we will ask you to agree again before you send more reports.',
        ],
      },
      {
        heading: '12. Our responsibility to you',
        blocks: [
          'The app is provided "as is". As far as Ghanaian law allows, we are not responsible for losses that come from relying on fares, travel times, weather or maps, from what drivers, operators or other users do, or from the app being unavailable.',
          'Nothing in these terms limits any responsibility that the law does not allow us to limit, or your rights under Ghanaian law.',
        ],
      },
      {
        heading: '13. Ending',
        blocks: [
          'You can stop using the app and delete your account at any time. We may suspend or close an account that breaks these terms. Sections 6, 10, 12 and 14 continue to apply after that.',
        ],
      },
      {
        heading: '14. Law and disputes',
        blocks: [
          `These terms are governed by the laws of the Republic of Ghana. If you have a problem, please contact us first at ${e.email} and we will try to resolve it. If we cannot, the courts of Ghana will decide.`,
        ],
      },
      {
        heading: '15. Contact us',
        blocks: [`${e.name}, ${e.address}. Email: ${e.email}.`],
      },
    ],
  };
}

/** The document as Markdown, for docs/legal and for the lawyer. */
export function legalMarkdown(doc: LegalDocument, draft: boolean = LEGAL_IS_DRAFT): string {
  const out = [`# ${doc.title}`, '', `Version ${doc.version} · Last updated ${doc.updated}`, ''];
  if (draft) out.push('> **Draft for legal review.** Not yet approved by a lawyer. Text in [brackets] is still to be filled in.', '');
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, '');
    for (const block of section.blocks) {
      if (typeof block === 'string') out.push(block, '');
      else out.push(...block.map((item) => `- ${item}`), '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}
