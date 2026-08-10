export interface TourStep {
  target: string
  title: string
  content: string
  /** Where to place the tooltip relative to the target. Defaults to 'below'. */
  placement?: 'right' | 'below'
}

export const userTourSteps: TourStep[] = [
  {
    target: '[data-tour="logo"]',
    title: 'Bienvenue sur E-Formation',
    content: 'Une courte visite guidée pour découvrir les principales fonctionnalités de votre espace.',
    placement: 'right',
  },
  {
    target: '[data-tour="search"]',
    title: 'Recherche rapide',
    content: 'Recherchez instantanément une formation, une leçon, un article ou une session live, avec un lien direct vers chaque résultat.',
    placement: 'below',
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: 'Tableau de bord',
    content: 'Suivez votre progression, votre temps d\'apprentissage et vos badges obtenus.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-courses"]',
    title: 'Formations',
    content: 'Parcourez le catalogue de formations et reprenez celles que vous avez commencées.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-live"]',
    title: 'Sessions live',
    content: 'Rejoignez des sessions interactives en direct avec vos formateurs.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-badges"]',
    title: 'Badges & Certificats',
    content: 'Consultez les badges débloqués et téléchargez vos certificats de réussite.',
    placement: 'right',
  },
  {
    target: '[data-tour="notifications"]',
    title: 'Notifications',
    content: 'Restez informé des nouveautés, rappels et messages qui vous concernent.',
    placement: 'below',
  },
  {
    target: '[data-tour="user-menu"]',
    title: 'Votre profil',
    content: 'Gérez votre profil et vos paramètres personnels depuis ce menu.',
    placement: 'below',
  },
]

export const adminTourSteps: TourStep[] = [
  {
    target: '[data-tour="logo"]',
    title: 'Espace administration',
    content: 'Une courte visite guidée pour découvrir les outils d\'administration de la plateforme.',
    placement: 'right',
  },
  {
    target: '[data-tour="section-toggle"]',
    title: 'Changer d\'espace',
    content: 'Basculez à tout moment entre votre espace utilisateur et l\'administration.',
    placement: 'right',
  },
  {
    target: '[data-tour="search"]',
    title: 'Recherche rapide',
    content: 'Retrouvez rapidement un cours, un utilisateur ou une session, avec un lien direct vers la page concernée.',
    placement: 'below',
  },
  {
    target: '[data-tour="nav-analytics"]',
    title: 'Analytics',
    content: 'Suivez les statistiques d\'utilisation et d\'engagement de la plateforme.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-users"]',
    title: 'Utilisateurs',
    content: 'Gérez les comptes, les rôles et les rattachements organisationnels.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-courses"]',
    title: 'Cours',
    content: 'Créez, publiez et organisez le contenu pédagogique des formations.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-live-sessions"]',
    title: 'Sessions live',
    content: 'Planifiez et animez des sessions de formation en direct.',
    placement: 'right',
  },
  {
    target: '[data-tour="nav-logs"]',
    title: 'Journaux d\'audit',
    content: 'Consultez l\'historique des actions sensibles pour la conformité et la sécurité.',
    placement: 'right',
  },
  {
    target: '[data-tour="notifications"]',
    title: 'Notifications',
    content: 'Retrouvez vos alertes et notifications d\'administration.',
    placement: 'below',
  },
  {
    target: '[data-tour="user-menu"]',
    title: 'Votre compte',
    content: 'Gérez votre compte administrateur depuis ce menu.',
    placement: 'below',
  },
]
