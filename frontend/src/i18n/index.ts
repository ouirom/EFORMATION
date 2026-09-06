import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Namespaces, one per major app area -- keeps each translation file to a
// reviewable size instead of one giant JSON blob for the whole app.
import commonFr from './locales/fr/common.json';
import layoutFr from './locales/fr/layout.json';
import authFr from './locales/fr/auth.json';
import dashboardFr from './locales/fr/dashboard.json';
import coursesFr from './locales/fr/courses.json';
import liveFr from './locales/fr/live.json';
import chatFr from './locales/fr/chat.json';
import badgesFr from './locales/fr/badges.json';
import certificatesFr from './locales/fr/certificates.json';
import notificationsFr from './locales/fr/notifications.json';
import searchFr from './locales/fr/search.json';
import blogFr from './locales/fr/blog.json';
import profileFr from './locales/fr/profile.json';
import myTeamFr from './locales/fr/myTeam.json';
import aiTutorFr from './locales/fr/aiTutor.json';
import adminFr from './locales/fr/admin.json';
import sharedFr from './locales/fr/shared.json';
import tourFr from './locales/fr/tour.json';
import helpFr from './locales/fr/help.json';

import commonEn from './locales/en/common.json';
import layoutEn from './locales/en/layout.json';
import authEn from './locales/en/auth.json';
import dashboardEn from './locales/en/dashboard.json';
import coursesEn from './locales/en/courses.json';
import liveEn from './locales/en/live.json';
import chatEn from './locales/en/chat.json';
import badgesEn from './locales/en/badges.json';
import certificatesEn from './locales/en/certificates.json';
import notificationsEn from './locales/en/notifications.json';
import searchEn from './locales/en/search.json';
import blogEn from './locales/en/blog.json';
import profileEn from './locales/en/profile.json';
import myTeamEn from './locales/en/myTeam.json';
import aiTutorEn from './locales/en/aiTutor.json';
import adminEn from './locales/en/admin.json';
import sharedEn from './locales/en/shared.json';
import tourEn from './locales/en/tour.json';
import helpEn from './locales/en/help.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = 'app-language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        common: commonFr,
        layout: layoutFr,
        auth: authFr,
        dashboard: dashboardFr,
        courses: coursesFr,
        live: liveFr,
        chat: chatFr,
        badges: badgesFr,
        certificates: certificatesFr,
        notifications: notificationsFr,
        search: searchFr,
        blog: blogFr,
        profile: profileFr,
        myTeam: myTeamFr,
        aiTutor: aiTutorFr,
        admin: adminFr,
        shared: sharedFr,
        tour: tourFr,
        help: helpFr,
      },
      en: {
        common: commonEn,
        layout: layoutEn,
        auth: authEn,
        dashboard: dashboardEn,
        courses: coursesEn,
        live: liveEn,
        chat: chatEn,
        badges: badgesEn,
        certificates: certificatesEn,
        notifications: notificationsEn,
        search: searchEn,
        blog: blogEn,
        profile: profileEn,
        myTeam: myTeamEn,
        aiTutor: aiTutorEn,
        admin: adminEn,
        shared: sharedEn,
        tour: tourEn,
        help: helpEn,
      },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    defaultNS: 'common',
    ns: [
      'common', 'layout', 'auth', 'dashboard', 'courses', 'live', 'chat', 'badges',
      'certificates', 'notifications', 'search', 'blog', 'profile', 'myTeam', 'aiTutor', 'admin',
      'shared', 'tour', 'help',
    ],
    interpolation: { escapeValue: false },
    // Detect only from a language the user explicitly picked via the switcher
    // (persisted to localStorage) -- this app has always been French by
    // default, so we deliberately don't fall back to the browser/OS locale,
    // which would silently switch existing French-speaking users to English
    // the moment their OS locale happens to be English.
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
