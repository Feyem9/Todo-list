# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - XSS, JSON corrompu, Double render, Sélecteur fragile, Collision ID, Titre vide
  - **CRITICAL**: Ce test DOIT ÉCHOUER sur le code non corrigé — l'échec confirme que les bugs existent
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: Ce test encode le comportement attendu — il validera les corrections quand il passera après implémentation
  - **GOAL**: Faire émerger des contre-exemples qui démontrent l'existence des bugs
  - **Scoped PBT Approach**: Pour les bugs déterministes, cibler les cas concrets qui échouent pour garantir la reproductibilité

  **Bug 1 — XSS** (`isBugCondition_XSS` dans design.md)
  - Créer une tâche avec titre `<img src=x onerror=alert(1)>` → observer l'exécution du script dans le DOM
  - Créer une tâche avec titre `<b>Important</b>` → observer le rendu en gras au lieu du texte brut
  - Contre-exemple attendu : le script s'exécute ou le HTML est interprété

  **Bug 2 — JSON corrompu** (`isBugCondition_JSON` dans design.md)
  - Exécuter `localStorage.setItem('tasks', '{invalid}')` puis recharger la page
  - Contre-exemple attendu : `Uncaught SyntaxError` dans la console, application plantée

  **Bug 3 — Double render** (`isBugCondition_DoubleRender` dans design.md)
  - Ajouter un `console.log('render')` dans `renderTasks()` et observer 2 appels au démarrage
  - Contre-exemple attendu : `renderTasks` appelé 2 fois lors du chargement initial

  **Bug 4 — Sélecteur fragile** (`isBugCondition_Selector` dans design.md)
  - Tenter de supprimer une tâche et inspecter si `taskEl` est null (sélecteur `:has()` dépendant des `onclick` inline)
  - Contre-exemple attendu : `TypeError: Cannot read properties of null` si structure change

  **Bug 5 — Collision ID** (`isBugCondition_ID` dans design.md)
  - Mocker `Date.now()` pour retourner une valeur fixe, créer deux tâches → observer IDs identiques
  - Contre-exemple attendu : `task1.id === task2.id`

  **Bug 6 — Titre vide** (`isBugCondition_EmptyTitle` dans design.md)
  - Cliquer "Add Task" sans titre → observer l'absence totale de feedback visuel
  - Contre-exemple attendu : rien ne se passe, aucun message d'erreur

  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (confirme que les bugs existent)
  - Documenter les contre-exemples trouvés pour comprendre les causes racines
  - Marquer la tâche complète quand les tests sont écrits, exécutés et les échecs documentés
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Comportements existants non affectés par les corrections
  - **IMPORTANT**: Suivre la méthodologie observation-first
  - Observer le comportement sur le code NON CORRIGÉ pour les entrées non-buggy

  **Preservation 1 — Tâches valides (sans HTML)**
  - Observer : créer une tâche avec titre `Acheter du pain` → s'affiche correctement
  - Écrire un test property-based : pour tout titre sans caractères HTML spéciaux, le rendu est identique avant et après correction
  - Vérifier que le test PASSE sur le code non corrigé

  **Preservation 2 — localStorage valide**
  - Observer : `localStorage.setItem('tasks', '[{"id":1,"title":"Test","desc":"","priority":"low","dueDate":"","status":"pending"}]')` → tâche chargée correctement
  - Écrire un test property-based : pour tout JSON valide, `loadTasks()` charge les tâches sans crash
  - Vérifier que le test PASSE sur le code non corrigé

  **Preservation 3 — IDs distincts (ms différentes)**
  - Observer : deux tâches créées à des ms différentes ont des IDs distincts
  - Écrire un test : pour toute paire de tâches créées à des timestamps différents, `t1.id ≠ t2.id`
  - Vérifier que le test PASSE sur le code non corrigé

  **Preservation 4 — Ajout avec titre valide**
  - Observer : titre valide → tâche créée, aucun message d'erreur affiché
  - Écrire un test : pour tout titre non vide, `addTask()` crée la tâche sans afficher `.input-error`
  - Vérifier que le test PASSE sur le code non corrigé

  **Preservation 5 — Actions Complete/Delete**
  - Observer : les boutons Complete et Delete exécutent leurs actions correctement
  - Écrire un test : après correction, `toggleComplete(id)` et `deleteTask(id)` produisent le même résultat qu'avant
  - Vérifier que le test PASSE sur le code non corrigé

  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirme le comportement de base à préserver)
  - Marquer la tâche complète quand les tests sont écrits, exécutés et passent sur le code non corrigé
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix — Correction des 12 bugs de la Todo List

  - [x] 3.1 Bug 1 — Ajouter `escapeHtml()` et l'utiliser dans `renderTasks()` (script.js)
    - Ajouter en haut de `script.js` la fonction `escapeHtml(str)` qui échappe `&`, `<`, `>`, `"`, `'`
    - Dans `renderTasks()`, remplacer `${task.title}` par `${escapeHtml(task.title)}` et `${task.desc}` par `${escapeHtml(task.desc)}`
    - _Bug_Condition: isBugCondition_XSS(X) — X.title ou X.desc contient des caractères HTML spéciaux_
    - _Expected_Behavior: le texte brut est affiché sans interprétation HTML ni exécution de script_
    - _Preservation: les tâches avec titres valides (sans HTML) continuent à s'afficher identiquement_
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 3.2 Bug 2 — Entourer `JSON.parse` d'un try/catch dans `loadTasks()` (script.js)
    - Remplacer `tasks = JSON.parse(stored)` par un bloc `try { tasks = JSON.parse(stored) } catch (e) { tasks = [] }`
    - _Bug_Condition: isBugCondition_JSON(X) — localStorage contient un JSON invalide_
    - _Expected_Behavior: tasks = [] et l'application continue sans crash_
    - _Preservation: un localStorage valide continue à charger les tâches normalement_
    - _Requirements: 2.3, 3.2_

  - [x] 3.3 Bug 3 — Supprimer le double appel à `renderTasks()` au démarrage (script.js)
    - Ajouter un appel à `renderTasks()` à la fin de `loadTasks()` (après `sortTasks()`)
    - Supprimer le `renderTasks()` standalone en bas du fichier (garder uniquement `loadTasks()`)
    - _Bug_Condition: isBugCondition_DoubleRender — renderTasks appelé plus d'une fois au démarrage_
    - _Expected_Behavior: un seul appel à renderTasks() lors du chargement initial_
    - _Preservation: les tâches existantes continuent à s'afficher correctement au démarrage_
    - _Requirements: 2.4, 3.3_

  - [x] 3.4 Bug 4 — Remplacer le sélecteur `:has()` par `data-id` dans `deleteTask()` (script.js)
    - Dans `renderTasks()`, ajouter `taskEl.dataset.id = task.id` sur l'élément `.task` créé
    - Dans `deleteTask(id)`, remplacer le sélecteur `:has()` par `document.querySelector('.task[data-id="${id}"]')`
    - _Bug_Condition: isBugCondition_Selector — navigateur sans support :has() ou structure template modifiée_
    - _Expected_Behavior: l'élément .task est trouvé via data-id, indépendamment de la structure interne_
    - _Preservation: l'animation fade-out et la suppression continuent à fonctionner correctement_
    - _Requirements: 2.5, 3.4_

  - [x] 3.5 Bug 5 — Remplacer `Date.now()` par un ID unique garanti dans `addTask()` (script.js)
    - Remplacer `id: Date.now()` par `id: Date.now() + '_' + Math.random().toString(36).slice(2, 7)`
    - Mettre à jour les comparaisons d'IDs dans `deleteTask`, `toggleComplete` et `filterTasks` pour utiliser `String(t.id) === String(id)`
    - _Bug_Condition: isBugCondition_ID(t1, t2) — deux tâches créées dans la même milliseconde_
    - _Expected_Behavior: t1.id ≠ t2.id garanti même en cas de création simultanée_
    - _Preservation: les tâches créées à des ms différentes continuent à avoir des IDs distincts_
    - _Requirements: 2.6, 3.5_

  - [x] 3.6 Bug 6 — Ajouter feedback visuel sur titre vide dans `addTask()` (script.js + styles.css)
    - Dans `addTask()`, remplacer `if (!title) return;` par un bloc qui ajoute `.input-error` sur `#task-title`, focus le champ, et retire la classe après 2000ms
    - Dans `styles.css`, ajouter la règle `.input-error { border-color: #e53e3e !important; box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.2) !important; }`
    - _Bug_Condition: isBugCondition_EmptyTitle(X) — X.title.trim() = ""_
    - _Expected_Behavior: indicateur d'erreur visible sur #task-title, focus sur le champ_
    - _Preservation: un titre valide crée la tâche sans afficher d'erreur_
    - _Requirements: 2.7, 3.6_

  - [x] 3.7 Bug 7 — Supprimer l'attribut `required` orphelin (index.html)
    - Retirer `required` de `<input type="text" id="task-title" ...>` dans `index.html`
    - _Bug_Condition: isBugCondition_Required — #task-title a required sans <form> parent_
    - _Expected_Behavior: l'attribut required est absent, la validation est gérée par JS (Bug 6)_
    - _Preservation: le comportement de validation reste identique (géré par addTask())_
    - _Requirements: 2.8_

  - [x] 3.8 Bug 8 — Ajouter `aria-label` sur les boutons Complete/Delete dans `renderTasks()` (script.js)
    - Sur le bouton complete : `setAttribute('aria-label', task.status === 'completed' ? 'Marquer comme en attente : ' + escapeHtml(task.title) : 'Marquer comme complétée : ' + escapeHtml(task.title))`
    - Sur le bouton delete : `setAttribute('aria-label', 'Supprimer : ' + escapeHtml(task.title))`
    - _Bug_Condition: isBugCondition_AriaLabel — bouton .complete-btn ou .delete-btn sans aria-label_
    - _Expected_Behavior: chaque bouton a un aria-label décrivant l'action et le titre de la tâche_
    - _Preservation: les boutons continuent à exécuter leurs actions correctement_
    - _Requirements: 2.9, 3.7_

  - [x] 3.9 Bug 9 — Ajouter `aria-live` sur le conteneur `#tasks` (index.html)
    - Ajouter `aria-live="polite"` et `aria-label="Liste des tâches"` sur `<div id="tasks" class="tasks">`
    - _Bug_Condition: isBugCondition_AriaLive — #tasks sans attribut aria-live_
    - _Expected_Behavior: les technologies d'assistance sont notifiées des changements dynamiques_
    - _Preservation: le rendu des tâches reste identique visuellement_
    - _Requirements: 2.10_

  - [x] 3.10 Bug 10 — Ajouter `aria-hidden` sur `.priority-icon` dans `renderTasks()` (script.js)
    - Lors de la création du span `.priority-icon`, ajouter `priorityIcon.setAttribute('aria-hidden', 'true')`
    - _Bug_Condition: isBugCondition_Emoji — .priority-icon sans aria-hidden="true"_
    - _Expected_Behavior: les emojis sont masqués aux lecteurs d'écran_
    - _Preservation: les emojis continuent à s'afficher visuellement via CSS ::before_
    - _Requirements: 2.11_

  - [x] 3.11 Bug 11 — Ajouter `box-sizing: border-box` global (styles.css)
    - Ajouter en tête de `styles.css` : `*, *::before, *::after { box-sizing: border-box; }`
    - _Bug_Condition: isBugCondition_BoxSizing — élément avec padding et width:100% sans border-box_
    - _Expected_Behavior: aucun débordement de mise en page sur les inputs et éléments larges_
    - _Preservation: tous les styles existants continuent à s'appliquer correctement_
    - _Requirements: 2.12_

  - [x] 3.12 Bug 12 — Remplacer les `onclick` inline par `addEventListener` dans `renderTasks()` (script.js)
    - Refactoriser `renderTasks()` pour créer les boutons via `document.createElement` au lieu du template literal
    - Attacher `completeBtn.addEventListener('click', () => toggleComplete(task.id))` et `deleteBtn.addEventListener('click', () => confirmDelete(task.id))`
    - Supprimer les attributs `onclick` inline du template HTML
    - _Bug_Condition: isBugCondition_InlineHandler — bouton avec attribut onclick_
    - _Expected_Behavior: aucun attribut onclick inline, handlers attachés via addEventListener_
    - _Preservation: les actions Complete et Delete continuent à fonctionner identiquement_
    - _Requirements: 2.13, 3.7_

  - [x] 3.13 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - XSS, JSON corrompu, Double render, Sélecteur fragile, Collision ID, Titre vide
    - **IMPORTANT**: Re-exécuter les MÊMES tests de la tâche 1 — ne PAS écrire de nouveaux tests
    - Les tests de la tâche 1 encodent le comportement attendu
    - Quand ces tests passent, cela confirme que le comportement attendu est satisfait
    - **EXPECTED OUTCOME**: Tests PASS (confirme que les bugs sont corrigés)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.14 Verify preservation tests still pass
    - **Property 2: Preservation** - Comportements existants non affectés
    - **IMPORTANT**: Re-exécuter les MÊMES tests de la tâche 2 — ne PAS écrire de nouveaux tests
    - **EXPECTED OUTCOME**: Tests PASS (confirme l'absence de régressions)
    - Confirmer que tous les tests passent après les corrections
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 4. Checkpoint — Ensure all tests pass
  - Vérifier que tous les tests (exploration + preservation) passent
  - Vérifier manuellement dans le navigateur : XSS affiché en texte brut, localStorage corrompu récupéré, un seul render au démarrage, suppression fonctionnelle, IDs uniques, feedback sur titre vide, aria-labels présents, box-sizing correct
  - Demander à l'utilisateur si des questions se posent
