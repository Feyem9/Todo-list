# Bugfix Requirements Document

## Introduction

Ce document couvre l'ensemble des bugs identifiés lors de l'audit de l'application Todo List (vanilla JS/HTML/CSS). Les bugs vont de vulnérabilités critiques de sécurité (XSS) à des problèmes d'accessibilité et de robustesse. L'objectif est de corriger chaque défaut tout en préservant le comportement existant pour les cas non affectés.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — XSS via innerHTML non échappé**
1.1 WHEN un utilisateur saisit un titre de tâche contenant du HTML ou du JavaScript (ex. `<img src=x onerror=alert(1)>`) THEN le système injecte ce contenu brut dans le DOM via `innerHTML`, exécutant potentiellement du code malveillant

1.2 WHEN un utilisateur saisit une description contenant du HTML ou du JavaScript THEN le système injecte ce contenu brut dans le DOM via `innerHTML`, exécutant potentiellement du code malveillant

**Bug 2 — `JSON.parse` sans try/catch dans `loadTasks()`**
2.1 WHEN le localStorage contient une valeur corrompue ou invalide pour la clé `tasks` THEN le système plante silencieusement avec une exception non gérée et aucune tâche n'est chargée

**Bug 3 — Double render au démarrage**
3.1 WHEN l'application démarre THEN le système appelle `sortTasks()` dans `loadTasks()` puis appelle `renderTasks()` deux fois consécutivement (une fois implicitement via `loadTasks` et une fois explicitement), causant un rendu inutile

**Bug 4 — Sélecteur CSS `:has()` fragile dans `deleteTask()`**
4.1 WHEN une tâche est supprimée THEN le système utilise `document.querySelector('.task:has(button[onclick="confirmDelete(${id})"])')` pour trouver l'élément DOM, ce qui échoue si la structure HTML du template change ou si le navigateur ne supporte pas `:has()`

**Bug 5 — IDs de tâches basés sur `Date.now()`**
5.1 WHEN deux tâches sont créées dans la même milliseconde THEN le système leur attribue le même identifiant `id`, causant des conflits lors des opérations de suppression ou de complétion

**Bug 6 — Pas de feedback visuel sur validation du titre vide**
6.1 WHEN l'utilisateur clique sur "Add Task" sans avoir saisi de titre THEN le système ignore silencieusement l'action sans aucun retour visuel ou message d'erreur pour l'utilisateur

**Bug 7 — Attribut `required` inutile sans `<form>`**
7.1 WHEN l'utilisateur tente d'ajouter une tâche sans titre THEN l'attribut `required` sur `#task-title` n'a aucun effet car il n'y a pas de balise `<form>` parente, laissant croire à tort qu'une validation native est active

**Bug 8 — Pas d'`aria-label` sur les boutons Complete/Delete**
8.1 WHEN un lecteur d'écran parcourt les boutons "Mark Completed" et "Delete" THEN le système ne fournit pas d'information contextuelle sur la tâche concernée, rendant ces boutons indiscernables les uns des autres

**Bug 9 — Pas de `role` ou `aria-live` sur le conteneur de tâches**
9.1 WHEN des tâches sont ajoutées, supprimées ou modifiées dynamiquement THEN le système ne notifie pas les technologies d'assistance des changements dans le conteneur `#tasks`

**Bug 10 — Emojis de priorité non masqués aux lecteurs d'écran**
10.1 WHEN un lecteur d'écran lit une tâche THEN le système expose les emojis de priorité (🟢, 🟡, 🔴) comme contenu textuel, ajoutant du bruit inutile à la lecture

**Bug 11 — `box-sizing: border-box` non défini globalement**
11.1 WHEN des inputs ou éléments avec padding et width: 100% sont affichés THEN le système peut provoquer des débordements de mise en page car `box-sizing` n'est pas défini globalement

**Bug 12 — Event listeners `onclick` inline dans le HTML généré**
12.1 WHEN des tâches sont rendues THEN le système génère des attributs `onclick` inline (`onclick="toggleComplete(${task.id})"`, `onclick="confirmDelete(${task.id})"`) dans le HTML, mélangeant logique et template et rendant le code difficile à maintenir et tester

---

### Expected Behavior (Correct)

**Bug 1 — XSS via innerHTML non échappé**
2.1 WHEN un utilisateur saisit un titre contenant du HTML ou du JavaScript THEN le système SHALL échapper les caractères spéciaux (`<`, `>`, `&`, `"`, `'`) avant insertion dans le DOM, affichant le texte brut sans exécution de code

2.2 WHEN un utilisateur saisit une description contenant du HTML ou du JavaScript THEN le système SHALL échapper les caractères spéciaux avant insertion dans le DOM, affichant le texte brut sans exécution de code

**Bug 2 — `JSON.parse` sans try/catch**
2.3 WHEN le localStorage contient une valeur corrompue pour la clé `tasks` THEN le système SHALL capturer l'exception, initialiser `tasks` à un tableau vide et continuer à fonctionner normalement

**Bug 3 — Double render au démarrage**
2.4 WHEN l'application démarre THEN le système SHALL effectuer un seul appel à `renderTasks()` après le chargement et le tri des tâches

**Bug 4 — Sélecteur CSS `:has()` fragile**
2.5 WHEN une tâche est supprimée THEN le système SHALL localiser l'élément DOM de la tâche via un attribut `data-id` sur l'élément `.task`, indépendamment de la structure interne des boutons

**Bug 5 — IDs basés sur `Date.now()`**
2.6 WHEN deux tâches sont créées dans la même milliseconde THEN le système SHALL générer des identifiants uniques garantis (ex. combinaison de `Date.now()` et d'un compteur ou d'un suffixe aléatoire)

**Bug 6 — Pas de feedback visuel sur titre vide**
2.7 WHEN l'utilisateur clique sur "Add Task" sans titre THEN le système SHALL afficher un message d'erreur visible et/ou mettre en évidence le champ titre pour indiquer que la saisie est requise

**Bug 7 — Attribut `required` inutile**
2.8 WHEN le HTML est rendu THEN le système SHALL supprimer l'attribut `required` du champ `#task-title` puisque la validation est gérée programmatiquement en JavaScript

**Bug 8 — Pas d'`aria-label` sur les boutons**
2.9 WHEN les boutons Complete et Delete sont rendus THEN le système SHALL inclure un attribut `aria-label` décrivant l'action et le titre de la tâche concernée (ex. `aria-label="Marquer comme complétée : [titre]"`)

**Bug 9 — Pas de `aria-live` sur le conteneur**
2.10 WHEN le conteneur `#tasks` est rendu THEN le système SHALL posséder un attribut `aria-live="polite"` et `aria-label` approprié pour annoncer les changements dynamiques aux technologies d'assistance

**Bug 10 — Emojis non masqués**
2.11 WHEN les emojis de priorité sont rendus THEN le système SHALL les envelopper dans un élément avec `aria-hidden="true"` pour les masquer aux lecteurs d'écran

**Bug 11 — `box-sizing` non défini globalement**
2.12 WHEN les styles CSS sont appliqués THEN le système SHALL définir `box-sizing: border-box` globalement via `*, *::before, *::after` pour éviter tout débordement de mise en page

**Bug 12 — Event listeners inline**
2.13 WHEN des tâches sont rendues THEN le système SHALL attacher les gestionnaires d'événements via `addEventListener` sur les éléments DOM créés, sans attributs `onclick` inline dans le HTML généré

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN un utilisateur saisit un titre valide (sans HTML malveillant) THEN le système SHALL CONTINUE TO créer et afficher la tâche correctement avec son titre et sa description

3.2 WHEN le localStorage contient des données de tâches valides THEN le système SHALL CONTINUE TO charger et afficher ces tâches au démarrage

3.3 WHEN l'application démarre avec des tâches existantes THEN le système SHALL CONTINUE TO trier et afficher les tâches selon le tri courant

3.4 WHEN l'utilisateur supprime une tâche THEN le système SHALL CONTINUE TO animer la disparition de la tâche et mettre à jour la liste

3.5 WHEN des tâches sont créées à des moments différents THEN le système SHALL CONTINUE TO leur attribuer des identifiants distincts

3.6 WHEN l'utilisateur saisit un titre valide et clique sur "Add Task" THEN le système SHALL CONTINUE TO ajouter la tâche sans afficher de message d'erreur

3.7 WHEN les boutons Complete et Delete sont activés THEN le système SHALL CONTINUE TO exécuter les actions correspondantes (complétion/suppression) correctement

3.8 WHEN les tâches sont filtrées ou triées THEN le système SHALL CONTINUE TO afficher les résultats filtrés/triés correctement

3.9 WHEN le mode sombre est activé THEN le système SHALL CONTINUE TO appliquer les styles dark mode à tous les éléments

3.10 WHEN la barre de progression est mise à jour THEN le système SHALL CONTINUE TO refléter le ratio tâches complétées / total correctement

---

## Bug Condition Summary (Pseudocode)

```pascal
// Bug 1 — XSS
FUNCTION isBugCondition_XSS(X)
  INPUT: X of type TaskInput
  RETURN X.title CONTAINS html_special_chars OR X.desc CONTAINS html_special_chars
END FUNCTION

FOR ALL X WHERE isBugCondition_XSS(X) DO
  result ← renderTask'(X)
  ASSERT result displays escaped text AND no script execution
END FOR

FOR ALL X WHERE NOT isBugCondition_XSS(X) DO
  ASSERT renderTask(X) = renderTask'(X)
END FOR

// Bug 2 — JSON.parse
FUNCTION isBugCondition_JSON(X)
  INPUT: X of type LocalStorageValue
  RETURN X is NOT valid JSON
END FUNCTION

FOR ALL X WHERE isBugCondition_JSON(X) DO
  result ← loadTasks'(X)
  ASSERT tasks = [] AND no_crash(result)
END FOR

// Bug 5 — ID collision
FUNCTION isBugCondition_ID(X)
  INPUT: X of type TaskCreationEvent pair (t1, t2)
  RETURN t1.timestamp = t2.timestamp
END FUNCTION

FOR ALL X WHERE isBugCondition_ID(X) DO
  ASSERT t1.id ≠ t2.id
END FOR
```
