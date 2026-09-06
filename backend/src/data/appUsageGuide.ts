// Knowledge base the AI tutor uses to answer "how do I use this app" questions,
// as opposed to pedagogical questions about lesson/course content. Condensed
// from frontend/src/lib/helpContent.ts (the F1 contextual help feature) so both
// stay conceptually in sync -- kept as a separate copy rather than a cross-package
// import because the backend and frontend are independent TS projects with their
// own build config.
export type SupportedLanguage = 'fr' | 'en';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['fr', 'en'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

interface UsageTopicTranslation {
  title: string;
  keywords: string[];
  answer: string;
}

interface UsageTopicEntry {
  /** Stable id, used to pair the same topic across languages -- not shown to the user. */
  key: string;
  adminOnly?: boolean;
  translations: Record<SupportedLanguage, UsageTopicTranslation>;
}

const APP_USAGE_TOPICS: UsageTopicEntry[] = [
  {
    key: 'login',
    translations: {
      fr: {
        title: 'Connexion',
        keywords: ['connexion', 'connecter', 'login', 'se connecter'],
        answer:
          "Connectez-vous avec l'email et le mot de passe fournis par votre organisation. Si votre organisation l'a activé, vous pouvez aussi vous connecter via Google, Microsoft (SSO) ou vos identifiants d'annuaire (LDAP).",
      },
      en: {
        title: 'Signing in',
        keywords: ['login', 'log in', 'sign in', 'signing in'],
        answer:
          "Sign in with the email and password your organization gave you. If your organization has enabled it, you can also sign in via Google, Microsoft (SSO), or your directory credentials (LDAP).",
      },
    },
  },
  {
    key: 'register',
    translations: {
      fr: {
        title: 'Créer un compte',
        keywords: ['creer un compte', 'inscription', 'nouveau compte', 'compte en attente'],
        answer:
          "Depuis la page de connexion, cliquez sur « Créer un compte » et renseignez vos informations. Le compte est créé avec le statut « en attente » : vous ne pourrez pas vous connecter tant qu'un responsable (votre n+1, ou à défaut un administrateur) ne l'aura pas activé -- il en est automatiquement averti.",
      },
      en: {
        title: 'Creating an account',
        keywords: ['create an account', 'sign up', 'new account', 'pending account'],
        answer:
          'From the sign-in page, click "Create account" and fill in your details. The account is created with "pending" status: you cannot sign in until a supervisor (your direct manager, or an administrator if none) activates it -- they are notified automatically.',
      },
    },
  },
  {
    key: 'forgot-password',
    translations: {
      fr: {
        title: 'Mot de passe oublié',
        keywords: ['mot de passe oublie', 'reinitialiser', 'changer mon mot de passe', 'perdu mon mot de passe'],
        answer:
          "Sur la page de connexion, cliquez sur « Mot de passe oublié ? » et saisissez votre email pour recevoir un lien de réinitialisation (pensez à vérifier vos courriers indésirables). Le lien n'est valable qu'une durée limitée.",
      },
      en: {
        title: 'Forgot password',
        keywords: ['forgot password', 'reset password', 'change my password', 'lost my password'],
        answer:
          'On the sign-in page, click "Forgot password?" and enter your email to receive a reset link (check your spam folder if you don\'t see it). The link is only valid for a limited time.',
      },
    },
  },
  {
    key: 'dashboard',
    translations: {
      fr: {
        title: 'Tableau de bord',
        keywords: ['tableau de bord', 'dashboard', 'accueil'],
        answer:
          "Le tableau de bord (page d'accueil après connexion) résume votre progression, votre temps d'apprentissage et vos badges, ainsi que le catalogue de vos formations en cours, obligatoires et recommandées. Cliquez sur « Continuer » pour reprendre une formation là où vous vous êtes arrêté.",
      },
      en: {
        title: 'Dashboard',
        keywords: ['dashboard', 'home page', 'homepage'],
        answer:
          'The dashboard (the home page after signing in) summarizes your progress, learning time, and badges, plus the catalog of your in-progress, mandatory, and recommended courses. Click "Continue" to resume a course where you left off.',
      },
    },
  },
  {
    key: 'enroll-course',
    translations: {
      fr: {
        title: "S'inscrire à une formation",
        keywords: [
          'formation', 'cours', "s'inscrire", 'inscription formation', 'catalogue', 'rejoindre une formation',
        ],
        answer:
          "Parcourez le catalogue depuis « Formations » dans le menu, filtrez par catégorie ou niveau, puis ouvrez une formation et cliquez sur « S'inscrire » pour la rejoindre avant de commencer une leçon. Un certificat de réussite est délivré à la fin si la formation le propose.",
      },
      en: {
        title: 'Enrolling in a course',
        keywords: ['course', 'enroll', 'enrolling', 'catalog', 'join a course', 'sign up for a course'],
        answer:
          'Browse the catalog from "Courses" in the menu, filter by category or level, then open a course and click "Enroll" to join it before starting a lesson. A certificate of completion is issued at the end if the course offers one.',
      },
    },
  },
  {
    key: 'lessons-quizzes',
    translations: {
      fr: {
        title: 'Leçons et quiz',
        keywords: ['lecon', 'quiz', 'tentative', 'terminer la lecon', 'passer un quiz'],
        answer:
          "Le contenu d'une leçon (vidéo, document ou lien) s'affiche sur sa page ; marquez-la comme terminée pour faire progresser votre suivi. Si elle comporte un quiz, il est accessible depuis cette même page -- le nombre de tentatives autorisées et la durée limite, si elle existe, sont indiqués sur chaque quiz.",
      },
      en: {
        title: 'Lessons and quizzes',
        keywords: ['lesson', 'quiz', 'attempt', 'complete the lesson', 'take a quiz'],
        answer:
          'A lesson\'s content (video, document, or link) appears on its page; mark it complete to move your progress forward. If it includes a quiz, it\'s accessible from that same page -- the number of allowed attempts and the time limit, if any, are shown on each quiz.',
      },
    },
  },
  {
    key: 'badges',
    translations: {
      fr: {
        title: 'Badges',
        keywords: ['badge', 'recompense', 'trophee'],
        answer:
          "Les badges que vous débloquez en progressant dans vos formations sont visibles dans « Badges ». Chaque badge précise ses critères d'obtention.",
      },
      en: {
        title: 'Badges',
        keywords: ['badge', 'reward', 'trophy'],
        answer:
          'Badges you unlock as you progress through your courses are visible under "Badges". Each badge lists the criteria to earn it.',
      },
    },
  },
  {
    key: 'certificates',
    translations: {
      fr: {
        title: 'Certificats',
        keywords: ['certificat', 'telecharger mon certificat', 'expiration certificat'],
        answer:
          "Retrouvez tous vos certificats de réussite dans « Certificats », téléchargeables en PDF. Un certificat peut avoir une date d'expiration : vous serez averti avant qu'il n'expire, pour vous inciter à repasser la formation.",
      },
      en: {
        title: 'Certificates',
        keywords: ['certificate', 'download my certificate', 'certificate expiration'],
        answer:
          'Find all your completion certificates under "Certificates", downloadable as PDF. A certificate can have an expiration date: you\'ll be warned before it expires, prompting you to retake the course.',
      },
    },
  },
  {
    key: 'notifications',
    translations: {
      fr: {
        title: 'Notifications',
        keywords: ['notification'],
        answer:
          "« Notifications » regroupe les rappels, messages et nouveautés qui vous concernent. Cliquez sur une notification pour accéder directement à l'élément concerné.",
      },
      en: {
        title: 'Notifications',
        keywords: ['notification'],
        answer:
          '"Notifications" gathers the reminders, messages, and updates relevant to you. Click a notification to jump straight to the related item.',
      },
    },
  },
  {
    key: 'search',
    translations: {
      fr: {
        title: 'Recherche',
        keywords: ['recherche', 'rechercher', 'trouver une formation'],
        answer:
          "« Recherche » permet de trouver des formations, leçons, articles, quiz ou sessions live, avec des onglets pour filtrer par type. La loupe dans l'en-tête donne aussi un accès rapide sans quitter votre page.",
      },
      en: {
        title: 'Search',
        keywords: ['search', 'find a course'],
        answer:
          '"Search" lets you find courses, lessons, articles, quizzes, or live sessions, with tabs to filter by type. The magnifying glass in the header also gives quick access without leaving your current page.',
      },
    },
  },
  {
    key: 'chat',
    translations: {
      fr: {
        title: 'Chat',
        keywords: ['chat', 'discuter', 'message a un formateur'],
        answer:
          "« Chat » permet d'échanger en temps réel avec vos formateurs et collègues : sélectionnez une conversation dans la liste pour l'ouvrir.",
      },
      en: {
        title: 'Chat',
        keywords: ['chat', 'message an instructor'],
        answer:
          '"Chat" lets you message your instructors and colleagues in real time: pick a conversation from the list to open it.',
      },
    },
  },
  {
    key: 'live-sessions',
    translations: {
      fr: {
        title: 'Sessions live',
        keywords: [
          'session live', 'visioconference', 'rejoindre une session', 'webinaire', 'session en direct', 'plein ecran',
          'enregistrement de session',
        ],
        answer:
          "« Sessions live » liste les sessions à venir, en direct et passées. Ouvrez une session pour voir son détail (formateur, horaire, lien), puis cliquez sur « S'inscrire » pour une session à venir, ou « Rejoindre » une fois qu'elle est en direct. Si aucun lien externe n'a été configuré, une visioconférence intégrée s'ouvre directement dans l'application (avec un bouton plein écran).",
      },
      en: {
        title: 'Live sessions',
        keywords: [
          'live session', 'video conference', 'join a session', 'webinar', 'fullscreen', 'session recording',
        ],
        answer:
          '"Live sessions" lists upcoming, currently live, and past sessions. Open a session to see its details (instructor, time, link), then click "Enroll" for an upcoming session, or "Join" once it goes live. If no external link was set, a built-in video conference opens directly in the app (with a fullscreen button).',
      },
    },
  },
  {
    key: 'blog',
    translations: {
      fr: {
        title: 'Blog',
        keywords: ['blog', 'article'],
        answer: "« Blog » regroupe les articles publiés par votre organisation ; vous pouvez y laisser des commentaires.",
      },
      en: {
        title: 'Blog',
        keywords: ['blog', 'article'],
        answer: '"Blog" gathers the articles published by your organization; you can leave comments there.',
      },
    },
  },
  {
    key: 'profile-settings',
    translations: {
      fr: {
        title: 'Profil et paramètres',
        keywords: ['profil', 'parametres', 'preferences de notification', 'photo de profil', 'canal de notification'],
        answer:
          "Modifiez vos informations et votre photo depuis « Mon profil » (menu de votre avatar en haut à droite). Les préférences de notifications (email, SMS, WhatsApp, push) se gèrent dans « Paramètres » -- la cloche de notifications dans l'application reste toujours active, quel que soit ce choix.",
      },
      en: {
        title: 'Profile and settings',
        keywords: ['profile', 'settings', 'notification preferences', 'profile picture', 'notification channel'],
        answer:
          'Edit your information and photo from "My profile" (your avatar menu, top right). Notification preferences (email, SMS, WhatsApp, push) are managed in "Settings" -- the in-app notification bell stays active regardless of that choice.',
      },
    },
  },
  {
    key: 'my-team',
    translations: {
      fr: {
        title: 'Mon équipe',
        keywords: ['mon equipe', 'equipe', 'collaborateurs', 'superviseur direct', 'rapport periodique'],
        answer:
          "« Mon équipe » (managers/superviseurs) affiche la progression des collaborateurs qui vous sont directement rattachés -- jamais vos pairs ou supérieurs. Un superviseur ne voit que les agents qui lui sont explicitement assignés (page Utilisateurs, champ « Superviseur direct »). Vous pouvez y activer un rapport périodique (in-app et/ou email) résumant l'avancement de votre équipe.",
      },
      en: {
        title: 'My team',
        keywords: ['my team', 'team', 'direct reports', 'direct supervisor', 'periodic report'],
        answer:
          '"My team" (managers/supervisors) shows the progress of employees directly reporting to you -- never your peers or superiors. A supervisor only sees agents explicitly assigned to them (Users page, "Direct supervisor" field). You can enable a periodic report there (in-app and/or email) summarizing your team\'s progress.',
      },
    },
  },
  {
    key: 'admin-users',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Utilisateurs (administration)',
        keywords: [
          'creer un utilisateur', 'gerer les utilisateurs', 'importer des utilisateurs', 'role utilisateur',
          'activer un compte', 'suspendre un compte', 'statut du compte',
        ],
        answer:
          "Dans « Utilisateurs » (admin), créez, modifiez ou désactivez des comptes, et attribuez rôles et rattachements organisationnels. Le bouton « Importer » crée plusieurs comptes depuis un fichier CSV/Excel. Le menu d'actions de chaque ligne permet d'activer, suspendre, réactiver ou désactiver un compte. Un director/manager ne voit que les utilisateurs de niveau hiérarchique inférieur, rattachés à sa direction/service.",
      },
      en: {
        title: 'Users (administration)',
        keywords: [
          'create a user', 'manage users', 'import users', 'user role',
          'activate an account', 'suspend an account', 'account status',
        ],
        answer:
          'Under "Users" (admin), create, edit, or deactivate accounts, and assign roles and organizational units. The "Import" button creates several accounts at once from a CSV/Excel file. Each row\'s action menu lets you activate, suspend, reactivate, or deactivate an account. A director/manager only sees users at a lower hierarchy level, tied to their department/service.',
      },
    },
  },
  {
    key: 'admin-courses',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Gestion des cours (administration)',
        keywords: [
          'creer un cours', 'publier un cours', 'gerer le contenu', 'ajouter un module', 'ajouter une lecon',
          'nouveau cours',
        ],
        answer:
          "Dans « Cours » (admin), créez une formation avec « Nouveau cours », publiez/dépubliez-la, et utilisez « Gérer le contenu » pour organiser modules, leçons et quiz.",
      },
      en: {
        title: 'Course management (administration)',
        keywords: ['create a course', 'publish a course', 'manage content', 'add a module', 'add a lesson', 'new course'],
        answer:
          'Under "Courses" (admin), create a course with "New course", publish/unpublish it, and use "Manage content" to organize modules, lessons, and quizzes.',
      },
    },
  },
  {
    key: 'admin-assignments',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Attributions (administration)',
        keywords: ['attribution', 'formation obligatoire', 'echeance', 'formation recommandee'],
        answer:
          "« Attributions » (admin) permet d'assigner des formations obligatoires ou recommandées à des utilisateurs, services ou directions, avec une date d'échéance pour les obligatoires. Des relances automatiques sont envoyées à l'apprenant, puis à son manager si la formation reste en retard.",
      },
      en: {
        title: 'Assignments (administration)',
        keywords: ['assignment', 'mandatory course', 'due date', 'recommended course'],
        answer:
          '"Assignments" (admin) lets you assign mandatory or recommended courses to users, services, or departments, with a due date for mandatory ones. Automatic reminders are sent to the learner, then to their manager if the course stays overdue.',
      },
    },
  },
  {
    key: 'admin-live-sessions',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Sessions live (administration)',
        keywords: [
          'planifier une session', 'creer une session live', 'demarrer une session', 'terminer une session',
          'annuler une session',
        ],
        answer:
          "« Sessions live » (admin) : planifiez une session avec « Nouvelle session » (date/heure obligatoires). L'instructeur désigné (ou tout admin/director/manager) peut ensuite la « Démarrer » puis la « Terminer ». « Annuler » la marque comme annulée ; l'icône corbeille la supprime définitivement.",
      },
      en: {
        title: 'Live sessions (administration)',
        keywords: ['schedule a session', 'create a live session', 'start a session', 'end a session', 'cancel a session'],
        answer:
          '"Live sessions" (admin): schedule a session with "New session" (date/time required). The designated instructor (or any admin/director/manager) can then "Start" and later "End" it. "Cancel" marks it as canceled; the trash icon deletes it permanently.',
      },
    },
  },
  {
    key: 'admin-certificates',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Certificats (administration)',
        keywords: ['modele de certificat', 'template certificat', 'revoquer un certificat'],
        answer:
          "« Certificats » (admin) suit les certificats délivrés et leur statut. L'onglet « Templates » permet de créer des modèles HTML avec les variables {userName}, {courseName}, {date}, {certificateNumber}, avec un aperçu avant utilisation. Un certificat émis par erreur peut être révoqué.",
      },
      en: {
        title: 'Certificates (administration)',
        keywords: ['certificate template', 'revoke a certificate'],
        answer:
          '"Certificates" (admin) tracks issued certificates and their status. The "Templates" tab lets you create HTML templates with the {userName}, {courseName}, {date}, {certificateNumber} variables, with a preview before use. A certificate issued by mistake can be revoked.',
      },
    },
  },
  {
    key: 'admin-import',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Import de données (administration)',
        keywords: ['importer', 'modele excel', 'import de donnees'],
        answer:
          "« Import de données » (admin) fournit des modèles Excel téléchargeables (organisation, utilisateurs, cours, leçons, quiz) puis les importe en un clic, avec un résultat ligne par ligne. Les imports sont rejouables sans risque : un élément déjà existant est ignoré, pas dupliqué.",
      },
      en: {
        title: 'Data import (administration)',
        keywords: ['import', 'excel template', 'data import'],
        answer:
          '"Data import" (admin) provides downloadable Excel templates (organization, users, courses, lessons, quizzes) and imports them in one click, with a row-by-row result. Imports are safe to re-run: an item that already exists is skipped, not duplicated.',
      },
    },
  },
  {
    key: 'admin-organization',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Organisation (administration)',
        keywords: ['entreprise', 'direction', 'service', 'structure organisation', 'hierarchie'],
        answer:
          "« Organisation » (admin) gère la structure de l'entreprise (entreprises, directions, services), utilisée pour cibler les attributions de formations et déterminer ce que chaque manager voit dans « Mon équipe ».",
      },
      en: {
        title: 'Organization (administration)',
        keywords: ['company', 'department', 'service', 'organization structure', 'hierarchy'],
        answer:
          '"Organization" (admin) manages the company structure (companies, departments, services), used to target course assignments and determine what each manager sees in "My team".',
      },
    },
  },
  {
    key: 'admin-video-recording',
    adminOnly: true,
    translations: {
      fr: {
        title: 'Visioconférence et enregistrement (administration)',
        keywords: ['parametres livekit', 'configuration visioconference', 'parametres enregistrement', 'stockage s3'],
        answer:
          "« Visioconférence » (admin) configure les identifiants LiveKit du tenant (sinon la config globale du serveur est utilisée). « Enregistrement » configure le bucket S3-compatible nécessaire pour enregistrer les sessions live -- sans bucket activé, l'enregistrement reste indisponible.",
      },
      en: {
        title: 'Video conferencing and recording (administration)',
        keywords: ['livekit settings', 'video conference configuration', 'recording settings', 's3 storage'],
        answer:
          '"Video conferencing" (admin) configures the tenant\'s LiveKit credentials (otherwise the server\'s global config is used). "Recording" configures the S3-compatible bucket needed to record live sessions -- without an enabled bucket, recording stays unavailable.',
      },
    },
  },
  {
    key: 'admin-logs',
    adminOnly: true,
    translations: {
      fr: {
        title: "Journaux d'audit (administration)",
        keywords: ["journal d'audit", 'logs', 'historique des actions'],
        answer:
          "« Journaux d'audit » (admin) trace l'historique des actions sensibles effectuées sur la plateforme, filtrable par utilisateur, type d'action ou période.",
      },
      en: {
        title: 'Audit logs (administration)',
        keywords: ['audit log', 'logs', 'action history'],
        answer:
          '"Audit logs" (admin) tracks the history of sensitive actions taken on the platform, filterable by user, action type, or time period.',
      },
    },
  },
];

const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS, '');
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

/** Entries available to a given role -- admin-only topics are hidden from plain learners. */
function entriesForRole(role: string): UsageTopicEntry[] {
  const isAdminLike = ['super_admin', 'admin', 'director', 'manager', 'supervisor'].includes(role);
  return APP_USAGE_TOPICS.filter((t) => !t.adminOnly || isAdminLike);
}

/** Plain-text version of the guide in the requested language, for injection into the AI tutor's system prompt. */
export function buildAppUsageGuideText(role: string, language: SupportedLanguage): string {
  return entriesForRole(role)
    .map((entry) => {
      const t = entry.translations[language];
      return `- ${t.title}: ${t.answer}`;
    })
    .join('\n');
}

/**
 * Deterministic keyword match, used as a fallback answer when no AI provider is
 * configured (no OpenAI key) -- so "how do I use this app" questions still get a
 * real, correct answer instead of a generic "AI unavailable" message.
 *
 * Keywords are matched across ALL supported languages (so a French question still
 * matches while the preferred answer language is English, and vice versa); only
 * the returned translation is limited to `language`.
 */
export function matchUsageTopics(
  question: string,
  role: string,
  language: SupportedLanguage
): UsageTopicTranslation[] {
  const normalizedQuestion = normalize(question);
  const scored = entriesForRole(role)
    .map((entry) => {
      const allKeywords = SUPPORTED_LANGUAGES.flatMap((lang) => entry.translations[lang].keywords);
      const score = allKeywords.filter((kw) => normalizedQuestion.includes(normalize(kw))).length;
      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 2).map((s) => s.entry.translations[language]);
}
