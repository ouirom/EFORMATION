export interface HelpTopic {
  /** react-router path pattern, matched against the current location */
  pattern: string
  title: string
  tips: string[]
}

export const helpTopics: HelpTopic[] = [
  // --- Auth ---
  {
    pattern: '/login',
    title: 'Connexion',
    tips: [
      "Connectez-vous avec l'email et le mot de passe fournis par votre organisation.",
      'Utilisez "Mot de passe oublié ?" si vous ne pouvez pas vous connecter.',
      'Vous pouvez aussi vous connecter via Google ou Microsoft si votre organisation l\'a activé.',
    ],
  },
  {
    pattern: '/register',
    title: 'Créer un compte',
    tips: [
      'Renseignez vos informations pour créer votre compte apprenant.',
      'Un email de confirmation peut vous être envoyé selon la configuration de votre organisation.',
    ],
  },
  {
    pattern: '/forgot-password',
    title: 'Mot de passe oublié',
    tips: [
      "Saisissez votre email pour recevoir un lien de réinitialisation.",
      'Vérifiez vos courriers indésirables si vous ne recevez rien après quelques minutes.',
    ],
  },
  {
    pattern: '/reset-password',
    title: 'Réinitialiser le mot de passe',
    tips: [
      'Choisissez un nouveau mot de passe suffisamment robuste.',
      'Le lien de réinitialisation n\'est valable qu\'une durée limitée.',
    ],
  },

  // --- Learner ---
  {
    pattern: '/dashboard',
    title: 'Tableau de bord',
    tips: [
      'Retrouvez en un coup d\'œil votre progression, votre temps d\'apprentissage et vos badges.',
      'Le catalogue en bas de page liste vos formations en cours, obligatoires et recommandées.',
      'Cliquez sur "Continuer" pour reprendre une formation là où vous vous êtes arrêté.',
    ],
  },
  {
    pattern: '/courses',
    title: 'Formations',
    tips: [
      'Parcourez toutes les formations disponibles pour votre organisation.',
      'Utilisez la recherche et les filtres pour trouver une formation par catégorie ou niveau.',
      'Cliquez sur une formation pour voir son contenu détaillé et vous y inscrire.',
    ],
  },
  {
    pattern: '/courses/:id',
    title: 'Détail de la formation',
    tips: [
      'Cliquez sur "S\'inscrire" pour rejoindre la formation avant de commencer une leçon.',
      'Consultez le programme, les objectifs et les avis avant de commencer.',
      'Suivez votre progression module par module dans l\'onglet "Progression".',
      'Un certificat de réussite est délivré à la fin si la formation le propose.',
    ],
  },
  {
    pattern: '/courses/:courseId/lessons/:lessonId',
    title: 'Leçon',
    tips: [
      'Le contenu de la leçon (vidéo, document ou lien) s\'affiche dans cette page.',
      'Marquez la leçon comme terminée pour faire progresser votre suivi.',
      'Si la leçon comporte un quiz, il est accessible depuis cette page.',
    ],
  },
  {
    pattern: '/lessons/:lessonId/quizzes',
    title: 'Quiz de la leçon',
    tips: [
      'Retrouvez ici tous les quiz associés à cette leçon.',
      'Le nombre de tentatives autorisées et la durée limite sont indiqués sur chaque quiz.',
    ],
  },
  {
    pattern: '/lessons/:lessonId/quiz/create',
    title: 'Créer un quiz',
    tips: [
      'Définissez le titre, le score de réussite et les paramètres du quiz (tentatives, durée, tirage aléatoire).',
      'Vous pourrez ajouter les questions une fois le quiz créé.',
    ],
  },
  {
    pattern: '/quizzes/:quizId',
    title: 'Passer un quiz',
    tips: [
      'Répondez aux questions avant l\'expiration du temps imparti si une limite est fixée.',
      'Votre score et, selon la configuration, les bonnes réponses s\'affichent après soumission.',
      'Le nombre de tentatives restantes est indiqué en haut de la page.',
    ],
  },
  {
    pattern: '/quizzes/:quizId/manage-questions',
    title: 'Gestion des questions du quiz',
    tips: [
      'Ajoutez, modifiez ou supprimez les questions du quiz depuis cette page.',
      'Plusieurs types de questions sont proposés : QCM, Vrai/Faux, réponse courte, rédaction.',
    ],
  },
  {
    pattern: '/badges',
    title: 'Badges',
    tips: [
      'Consultez les badges que vous avez débloqués en progressant dans vos formations.',
      'Chaque badge précise les critères d\'obtention.',
    ],
  },
  {
    pattern: '/certificates',
    title: 'Certificats',
    tips: [
      'Retrouvez tous vos certificats de réussite obtenus.',
      'Téléchargez-les au format PDF pour les partager ou les archiver.',
      'Un certificat peut avoir une date d\'expiration : vous serez averti avant qu\'il n\'expire pour vous inciter à repasser la formation.',
    ],
  },
  {
    pattern: '/notifications',
    title: 'Notifications',
    tips: [
      'Retrouvez ici les rappels, messages et nouveautés qui vous concernent.',
      'Cliquez sur une notification pour accéder directement à l\'élément concerné.',
    ],
  },
  {
    pattern: '/search',
    title: 'Recherche',
    tips: [
      'Recherchez des formations, leçons, articles, quiz ou sessions live.',
      'Utilisez les onglets pour filtrer les résultats par type.',
      'La recherche rapide dans l\'en-tête (loupe) donne un accès direct sans quitter votre page.',
    ],
  },
  {
    pattern: '/chat',
    title: 'Chat',
    tips: [
      'Échangez en temps réel avec vos formateurs et collègues.',
      'Sélectionnez une conversation dans la liste pour l\'ouvrir.',
    ],
  },
  {
    pattern: '/chat/:conversationId',
    title: 'Conversation',
    tips: [
      'Envoyez des messages et des pièces jointes dans cette conversation.',
      'Les messages sont synchronisés en temps réel entre tous les participants.',
    ],
  },
  {
    pattern: '/live',
    title: 'Sessions live',
    tips: [
      'Consultez les sessions à venir, en direct et les enregistrements passés.',
      'Cliquez sur "Rejoindre" quand une session est en direct.',
    ],
  },
  {
    pattern: '/blog',
    title: 'Blog',
    tips: [
      'Découvrez les articles publiés par votre organisation.',
      'Laissez un commentaire pour échanger avec les autres lecteurs.',
    ],
  },
  {
    pattern: '/profile',
    title: 'Mon profil',
    tips: [
      'Modifiez vos informations personnelles et votre photo de profil.',
      'Gérez vos préférences de notifications depuis cette page.',
    ],
  },
  {
    pattern: '/ai-tutor',
    title: 'Assistant IA',
    tips: [
      'Posez vos questions à l\'assistant pour obtenir de l\'aide sur vos formations.',
      'L\'assistant peut vous recommander du contenu adapté à votre progression.',
    ],
  },
  {
    pattern: '/content-upload',
    title: 'Import de contenu',
    tips: [
      'Téléversez des documents, vidéos ou autres ressources pédagogiques.',
      'Les formats et la taille maximale acceptés sont indiqués lors de l\'import.',
    ],
  },

  // --- Admin ---
  {
    pattern: '/admin',
    title: 'Analytics (administration)',
    tips: [
      'Vue d\'ensemble des statistiques d\'utilisation et d\'engagement de la plateforme.',
      'Basculez entre l\'espace utilisateur et l\'administration via le bouton en haut de la barre latérale.',
    ],
  },
  {
    pattern: '/admin/analytics',
    title: 'Analytics',
    tips: [
      'Suivez les indicateurs clés : utilisateurs actifs, formations suivies, taux de complétion.',
      'Utilisez le sélecteur de période pour ajuster la plage d\'analyse.',
      'L\'onglet "Abandon par leçon" montre, pour un cours donné, le pourcentage d\'apprenants qui atteignent chaque leçon — utile pour repérer où ils décrochent.',
    ],
  },
  {
    pattern: '/admin/users',
    title: 'Utilisateurs',
    tips: [
      'Créez, modifiez ou désactivez des comptes utilisateurs.',
      'Attribuez les rôles (apprenant, manager, formateur, admin...) et les rattachements organisationnels.',
      'Utilisez la recherche pour retrouver rapidement un utilisateur.',
      'Le bouton "Importer" crée plusieurs comptes en une fois depuis un fichier CSV (colonnes : email, displayName, role, et les codes d\'entreprise/direction/service en option).',
    ],
  },
  {
    pattern: '/admin/courses',
    title: 'Gestion des cours',
    tips: [
      'Créez de nouvelles formations avec le bouton "Nouveau cours".',
      'Publiez ou dépubliez une formation, et modifiez son statut directement dans le formulaire d\'édition.',
      'Utilisez "Gérer le contenu" pour ajouter modules, leçons et quiz.',
      'Le menu d\'actions permet aussi de dupliquer ou supprimer une formation.',
    ],
  },
  {
    pattern: '/admin/courses/:id/edit',
    title: 'Contenu du cours',
    tips: [
      'Organisez le cours en modules, chacun contenant plusieurs leçons.',
      'Ajoutez des quiz à une leçon et gérez leurs questions depuis cette page.',
      'L\'onglet "Paramètres" renvoie vers la gestion des informations générales du cours.',
    ],
  },
  {
    pattern: '/admin/assignments',
    title: 'Attributions',
    tips: [
      'Attribuez des formations obligatoires ou recommandées à des utilisateurs, services ou directions.',
      'Définissez une date d\'échéance pour les formations obligatoires.',
      'Des relances automatiques sont envoyées à l\'apprenant avant et après l\'échéance ; si la formation reste en retard, son manager est prévenu.',
    ],
  },
  {
    pattern: '/admin/badges',
    title: 'Badges (administration)',
    tips: [
      'Créez et configurez les badges et leurs critères d\'obtention.',
      'Associez un badge à un quiz pour une remise automatique.',
    ],
  },
  {
    pattern: '/admin/certificates',
    title: 'Certificats (administration)',
    tips: [
      'Suivez les certificats délivrés aux apprenants, leur statut (valide/révoqué) et leur date d\'expiration.',
      'Onglet "Templates" : créez des modèles de certificat en HTML, avec les variables {userName}, {courseName}, {date} et {certificateNumber}. Un seul modèle peut être "par défaut" par organisation.',
      'Utilisez "Aperçu" pour visualiser un modèle avec des données d\'exemple avant de l\'utiliser.',
      'Révoquez un certificat délivré par erreur ou devenu invalide depuis la liste des certificats.',
    ],
  },
  {
    pattern: '/admin/live-sessions',
    title: 'Sessions live (administration)',
    tips: [
      'Planifiez une nouvelle session avec le bouton "Nouvelle session".',
      'Renseignez la date, la durée, le nombre de participants et le lien de réunion.',
      'Démarrez une session depuis cette page pour la faire apparaître comme "En direct".',
    ],
  },
  {
    pattern: '/admin/notifications',
    title: 'Notifications (administration)',
    tips: [
      'Envoyez des notifications ciblées à des utilisateurs ou groupes.',
      'Configurez les modèles de notifications automatiques.',
    ],
  },
  {
    pattern: '/admin/blog',
    title: 'Blog (administration)',
    tips: [
      'Rédigez, publiez ou archivez des articles pour votre organisation.',
      'Gérez les catégories et modérez les commentaires.',
    ],
  },
  {
    pattern: '/admin/reports',
    title: 'Rapports',
    tips: [
      'Générez des rapports sur l\'avancement des formations et la conformité.',
      'Exportez les données pour vos besoins de reporting.',
    ],
  },
  {
    pattern: '/admin/organization',
    title: 'Organisation',
    tips: [
      'Gérez la structure de votre organisation : entreprises, directions et services.',
      'Ces rattachements servent à cibler les attributions de formations.',
    ],
  },
  {
    pattern: '/admin/email-settings',
    title: 'Paramètres email',
    tips: [
      'Configurez le serveur d\'envoi et les modèles d\'emails transactionnels.',
      'Testez l\'envoi pour vérifier votre configuration.',
    ],
  },
  {
    pattern: '/admin/logs',
    title: 'Journaux d\'audit',
    tips: [
      'Consultez l\'historique des actions sensibles effectuées sur la plateforme.',
      'Filtrez par utilisateur, type d\'action ou période pour vos besoins de conformité.',
    ],
  },

  // --- Fallback ---
  {
    pattern: '*',
    title: 'Aide',
    tips: [
      'Aucune aide spécifique n\'est disponible pour cet écran.',
      'Utilisez "Toutes les rubriques" ci-dessous pour parcourir l\'aide des autres pages.',
    ],
  },
]
