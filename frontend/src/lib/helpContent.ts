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
      "Votre compte est créé avec le statut « en attente » : vous ne pourrez pas vous connecter tant qu'un responsable (n+1) ne l'aura pas activé.",
      'Un responsable (superviseur/manager/directeur ou, à défaut, un administrateur) est automatiquement averti de votre demande.',
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
      'Cliquez sur une session pour voir son détail : formateur, horaire, participants et lien de visioconférence (si renseigné).',
      'Depuis le détail, cliquez sur "S\'inscrire" pour une session à venir, ou "Rejoindre" une fois qu\'elle est passée en direct.',
    ],
  },
  {
    pattern: '/live/:id',
    title: 'Détail de la session live',
    tips: [
      'Inscrivez-vous à une session programmée avec "S\'inscrire", ou rejoignez-la avec "Rejoindre" une fois qu\'elle est en direct.',
      'Si aucun lien de visioconférence n\'a été configuré par l\'organisateur, votre inscription/participation est bien enregistrée mais aucun lien ne s\'ouvre automatiquement.',
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
      'Les préférences de notifications se gèrent depuis "Paramètres", accessible par le menu de votre avatar en haut à droite.',
    ],
  },
  {
    pattern: '/settings',
    title: 'Paramètres',
    tips: [
      'Choisissez, par canal (email, SMS, WhatsApp, push navigateur, push mobile), si vous souhaitez recevoir les notifications qui vous concernent.',
      'Les notifications dans l\'application (la cloche en haut de l\'écran) restent toujours visibles, quel que soit votre choix ici — seuls les envois vers les autres canaux sont concernés.',
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
  {
    pattern: '/my-team',
    title: 'Mon équipe',
    tips: [
      'Suivez la progression des collaborateurs qui vous sont directement rattachés (vous ne voyez que les niveaux hiérarchiques inférieurs au vôtre, jamais vos pairs ou vos supérieurs).',
      'En tant que superviseur, votre équipe se limite aux agents qui vous ont été explicitement attribués (page "Utilisateurs", champ "Superviseur direct") — pas à tout le service.',
      'La carte "Formations obligatoires en retard" additionne les attributions obligatoires dont l\'échéance est dépassée pour votre équipe.',
      'Activez "Rapport périodique" pour recevoir automatiquement, dans l\'application et/ou par email, un résumé de la progression de votre équipe (fréquence quotidienne ou hebdomadaire, jour au choix).',
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
      'Le bouton "Importer" crée plusieurs comptes en une fois depuis un fichier CSV ou Excel (colonnes : email, displayName, role, et les codes d\'entreprise/direction/service en option). Pour un modèle Excel pré-rempli, utilisez la page "Import de données".',
      'Un director/manager ne voit et ne gère que les utilisateurs de niveau hiérarchique inférieur au sien, rattachés à sa direction/service — jamais ses pairs ou ses supérieurs.',
      'Pour un agent, le champ "Superviseur direct" lui attribue un superviseur précis : ce superviseur ne verra que les agents qui lui sont explicitement assignés dans "Mon équipe", pas tout le service.',
      'Externe et stagiaire sont des types d\'utilisateur avec exactement les mêmes droits qu\'agent — ils permettent seulement de distinguer les prestataires externes et les stagiaires des employés dans les listes et rapports.',
      'Statut : "En attente" (inscription en libre-service pas encore activée), "Actif", "Suspendu" (par un admin, ou automatiquement pour inactivité) et "Désactivé". Le menu d\'actions de chaque ligne permet d\'activer, suspendre, réactiver ou désactiver un compte.',
      'La carte "Suspension automatique pour inactivité" (admin uniquement) définit, par type de compte, au bout de combien de jours sans connexion un compte actif est automatiquement suspendu.',
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
      'Chaque badge a un code unique (ex: QUIZ_COMPLETED), un nom, un type (trophée, quiz complété, score parfait, début/fin de cours...) et un critère d\'obtention au format JSON libre (ex: {"type": "quiz_pass"}).',
      'L\'attribution automatique de certains badges (quiz réussi, score parfait, cours démarré/terminé) est câblée sur le code du badge, pas sur le contenu du critère JSON — celui-ci reste informatif.',
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
      'Planifiez une nouvelle session avec le bouton "Nouvelle session" — la date et l\'heure sont obligatoires.',
      'Le champ "Instructeur" désigne qui animera la session ; cette personne (ou tout admin/director/manager) pourra ensuite la démarrer et la terminer, pas forcément vous qui l\'avez créée.',
      'Une fois programmée, démarrez la session avec "Démarrer" pour la faire apparaître comme "En direct" aux apprenants, puis "Terminer" une fois finie.',
      '"Annuler" une session programmée la marque comme annulée ; l\'icône de corbeille la supprime définitivement, avec son historique de participants.',
      'Modifiez une session existante (y compris réassigner l\'instructeur) avec l\'icône de crayon.',
    ],
  },
  {
    pattern: '/admin/notifications',
    title: 'Notifications (administration)',
    tips: [
      'Envoyez une notification via "Envoyer une notification" : choisissez le canal (application, email, SMS, WhatsApp, push) et les destinataires (tous les utilisateurs, un utilisateur précis, ou tout un rôle).',
      'La liste ci-dessous affiche l\'historique des notifications envoyées dans votre organisation, avec leur statut lu/non lu par destinataire.',
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
      'Ces rattachements servent à cibler les attributions de formations et déterminent aussi ce que chaque manager/director peut voir dans "Mon équipe".',
      'Pour créer toute la hiérarchie en une fois depuis un fichier Excel, utilisez la page "Import de données".',
    ],
  },
  {
    pattern: '/admin/import',
    title: 'Import de données',
    tips: [
      'Téléchargez le modèle Excel de chaque section ("Télécharger le modèle") avant de le remplir : hiérarchie d\'organisation, utilisateurs, cours, leçons ou quiz.',
      'Renseignez le modèle puis importez-le avec "Importer" ; le résultat ligne par ligne (créé/ignoré/erreur) s\'affiche juste en dessous.',
      'Les imports sont rejouables sans risque : un élément déjà existant (même titre, même code) est automatiquement ignoré plutôt que dupliqué.',
      'L\'import des leçons nécessite que le cours existe déjà (importez-le d\'abord) ; l\'import des quiz nécessite que le cours ET la leçon existent déjà.',
      'Les sections visibles dépendent de votre rôle : la hiérarchie d\'organisation est réservée aux admins, les utilisateurs aux admins/directors, les cours/leçons/quiz aux admins/directors/managers.',
    ],
  },
  {
    pattern: '/admin/platform',
    title: 'Plateforme',
    tips: [
      'Réservé au super admin : gérez toutes les organisations (tenants) de la plateforme, tous établissements confondus.',
      '"Nouvelle organisation" crée un nouveau tenant, isolé des autres (utilisateurs, cours et données propres).',
      '"Basculer vers" change votre contexte actif pour agir au sein d\'une organisation donnée, comme si vous étiez admin de ce tenant.',
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
