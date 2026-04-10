# Todo List — Bugfix Design

## Overview

Ce document décrit la stratégie de correction des 12 bugs identifiés dans l'application Todo List (vanilla JS/HTML/CSS). Les bugs couvrent : une vulnérabilité XSS critique, un crash au chargement, un double rendu, un sélecteur DOM fragile, des collisions d'IDs, l'absence de feedback utilisateur, un attribut HTML inutile, des lacunes d'accessibilité (aria), un problème CSS de box-sizing, et des event listeners inline.

L'approche est **minimale et ciblée** : chaque correction touche uniquement le code responsable du bug, sans refactoring global. Les comportements existants pour les cas non affectés sont préservés.

---

## Glossary

- **Bug_Condition (C)** : La condition qui déclenche le bug — l'entrée ou l'état qui provoque le comportement défectueux
- **Property (P)** : Le comportement attendu correct lorsque la condition de bug est présente
- **Preservation** : Les comportements existants qui ne doivent pas être modifiés par les corrections
- **renderTasks(filteredTasks)** : Fonction dans `script.js` qui génère le HTML des tâches et les insère dans `#tasks`
- **loadTasks()** : Fonction dans `script.js` qui lit le localStorage et initialise le tableau `tasks`
- **deleteTask(id)** : Fonction dans `script.js` qui anime et supprime une tâche par son ID
- **addTask()** : Fonction dans `script.js` qui lit le formulaire et crée une nouvelle tâche
- **isBugCondition** : Pseudocode décrivant formellement les entrées qui déclenchent chaque bug

---

## Bug Details

### Bug 1 — XSS via innerHTML non échappé

Le bug se manifeste quand un utilisateur saisit un titre ou une description contenant des caractères HTML spéciaux (`<`, `>`, `&`, `"`, `'`). La fonction `renderTasks()` insère ces valeurs directement via `innerHTML` sans échappement.

**Formal Specification:**
```
FUNCTION isBugCondition_XSS(input)
  INPUT: input of type TaskInput { title: string, desc: string }
  OUTPUT: boolean

  RETURN input.title CONTAINS_ANY ['<', '>', '&', '"', "'"]
         OR input.desc CONTAINS_ANY ['<', '>', '&', '"', "'"]
END FUNCTION
```

**Examples:**
- Titre `<img src=x onerror=alert(1)>` → exécute du JS (bug) → doit afficher le texte brut
- Titre `<b>Important</b>` → affiche en gras (bug) → doit afficher `<b>Important</b>` littéralement
- Titre `Acheter du pain` → s'affiche correctement (pas de bug)

---

### Bug 2 — JSON.parse sans try/catch dans loadTasks()

Le bug se manifeste quand `localStorage.getItem('tasks')` retourne une chaîne JSON invalide ou corrompue. `JSON.parse()` lève une `SyntaxError` non gérée qui plante l'application.

**Formal Specification:**
```
FUNCTION isBugCondition_JSON(input)
  INPUT: input of type string (valeur localStorage)
  OUTPUT: boolean

  RETURN input IS NOT NULL
         AND JSON.parse(input) THROWS SyntaxError
END FUNCTION
```

**Examples:**
- `localStorage.tasks = "{"` → crash SyntaxError (bug) → doit initialiser `tasks = []`
- `localStorage.tasks = "undefined"` → crash (bug) → doit initialiser `tasks = []`
- `localStorage.tasks = '[{"id":1}]'` → chargement normal (pas de bug)

---

### Bug 3 — Double render au démarrage

Le bug se manifeste à chaque démarrage de l'application. `loadTasks()` appelle `sortTasks()` en fin d'exécution, puis le code global appelle `renderTasks()` deux fois : une fois implicitement (via `loadTasks` qui ne rend pas, mais le code global appelle `renderTasks()` après `loadTasks()`), et une seconde fois explicitement.

**Formal Specification:**
```
FUNCTION isBugCondition_DoubleRender(context)
  INPUT: context = application startup
  OUTPUT: boolean

  RETURN renderTasks IS CALLED more than once
         DURING initial page load
END FUNCTION
```

**Examples:**
- Démarrage avec 5 tâches → `renderTasks()` appelé 2 fois → 1 seul appel attendu
- Code actuel ligne finale : `loadTasks(); renderTasks();` → le second appel est superflu

---

### Bug 4 — Sélecteur CSS :has() fragile dans deleteTask()

Le bug se manifeste quand `deleteTask(id)` tente de trouver l'élément `.task` via `document.querySelector('.task:has(button[onclick="confirmDelete(${id})"])')`. Ce sélecteur dépend de la structure interne du template et de la valeur exacte de l'attribut `onclick`.

**Formal Specification:**
```
FUNCTION isBugCondition_Selector(context)
  INPUT: context = { browser: Browser, templateChanged: boolean }
  OUTPUT: boolean

  RETURN NOT browser.supports(':has()')
         OR templateChanged = true
         OR onclick_attribute_format_changed = true
END FUNCTION
```

**Examples:**
- Navigateur sans support `:has()` → `querySelector` retourne `null` → crash
- Après correction du bug 12 (suppression des `onclick` inline) → sélecteur ne trouve plus rien

---

### Bug 5 — IDs basés sur Date.now()

Le bug se manifeste quand deux tâches sont créées dans la même milliseconde (ex. tests automatisés, double-clic rapide). `Date.now()` retourne la même valeur, produisant deux tâches avec le même `id`.

**Formal Specification:**
```
FUNCTION isBugCondition_ID(pair)
  INPUT: pair = (task1, task2) créées consécutivement
  OUTPUT: boolean

  RETURN task1.createdAt_ms = task2.createdAt_ms
END FUNCTION
```

**Examples:**
- Deux tâches créées à `t=1700000000000` → `id` identique → conflit delete/complete
- Tâches créées à des ms différentes → IDs distincts (pas de bug)

---

### Bug 6 — Pas de feedback visuel sur titre vide

Le bug se manifeste quand l'utilisateur clique sur "Add Task" sans saisir de titre. La fonction `addTask()` fait `if (!title) return;` silencieusement, sans aucun retour visuel.

**Formal Specification:**
```
FUNCTION isBugCondition_EmptyTitle(input)
  INPUT: input = { title: string }
  OUTPUT: boolean

  RETURN input.title.trim() = ""
END FUNCTION
```

**Examples:**
- Clic "Add Task" avec champ vide → rien ne se passe (bug) → doit afficher une erreur
- Clic "Add Task" avec titre valide → tâche créée (pas de bug)

---

### Bug 7 — Attribut required inutile sans form

Le bug est structurel : `#task-title` possède `required` mais n'est pas dans un `<form>`. L'attribut n'a aucun effet et induit en erreur sur la validation active.

**Formal Specification:**
```
FUNCTION isBugCondition_Required(element)
  INPUT: element = #task-title
  OUTPUT: boolean

  RETURN element.hasAttribute('required')
         AND element.closest('form') = null
END FUNCTION
```

---

### Bug 8 — Pas d'aria-label sur les boutons Complete/Delete

Le bug se manifeste quand un lecteur d'écran lit les boutons d'action. Tous les boutons "Mark Completed" et "Delete" sont indiscernables car ils n'ont pas de contexte sur la tâche concernée.

**Formal Specification:**
```
FUNCTION isBugCondition_AriaLabel(button)
  INPUT: button = DOM button element
  OUTPUT: boolean

  RETURN button.classList CONTAINS_ANY ['complete-btn', 'delete-btn']
         AND button.getAttribute('aria-label') = null
END FUNCTION
```

---

### Bug 9 — Pas de aria-live sur le conteneur de tâches

Le bug se manifeste lors de modifications dynamiques de la liste. Le conteneur `#tasks` ne possède pas `aria-live`, donc les technologies d'assistance ne sont pas notifiées des changements.

**Formal Specification:**
```
FUNCTION isBugCondition_AriaLive(element)
  INPUT: element = #tasks container
  OUTPUT: boolean

  RETURN element.getAttribute('aria-live') = null
END FUNCTION
```

---

### Bug 10 — Emojis de priorité non masqués aux lecteurs d'écran

Le bug se manifeste quand un lecteur d'écran lit une tâche. Les emojis 🟢, 🟡, 🔴 sont lus comme contenu textuel, ajoutant du bruit inutile.

**Formal Specification:**
```
FUNCTION isBugCondition_Emoji(element)
  INPUT: element = .priority-icon span
  OUTPUT: boolean

  RETURN element.getAttribute('aria-hidden') ≠ 'true'
END FUNCTION
```

---

### Bug 11 — box-sizing non défini globalement

Le bug se manifeste sur les éléments avec `width: 100%` et `padding`. Sans `box-sizing: border-box` global, le padding s'ajoute à la largeur déclarée, causant des débordements.

**Formal Specification:**
```
FUNCTION isBugCondition_BoxSizing(element)
  INPUT: element = any DOM element
  OUTPUT: boolean

  RETURN getComputedStyle(element).boxSizing ≠ 'border-box'
         AND element HAS padding AND width = '100%'
END FUNCTION
```

---

### Bug 12 — Event listeners onclick inline

Le bug se manifeste dans `renderTasks()` : les boutons sont créés avec des attributs `onclick` inline dans le template HTML. Cela mélange logique et présentation, et rend le code difficile à tester.

**Formal Specification:**
```
FUNCTION isBugCondition_InlineHandler(element)
  INPUT: element = button DOM element
  OUTPUT: boolean

  RETURN element.hasAttribute('onclick')
END FUNCTION
```

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- La création de tâches avec un titre valide doit continuer à fonctionner exactement comme avant
- Le chargement des tâches depuis un localStorage valide doit continuer à fonctionner
- Le tri, le filtrage et la recherche de tâches doivent rester inchangés
- L'animation de suppression (fade-out) doit rester fonctionnelle
- Le mode sombre doit continuer à s'appliquer correctement
- La barre de progression doit continuer à se mettre à jour correctement
- Les boutons Complete et Delete doivent continuer à exécuter leurs actions

**Scope:**
Toutes les entrées qui ne déclenchent pas les conditions de bug (titre valide sans HTML, localStorage valide, IDs créés à des ms différentes, etc.) doivent produire exactement le même comportement qu'avant les corrections.

---

## Hypothesized Root Cause

1. **Utilisation non sécurisée d'innerHTML (Bug 1)** : `renderTasks()` construit le HTML via template literals et l'assigne à `innerHTML` sans aucun échappement. Les valeurs `task.title` et `task.desc` sont insérées brutes.

2. **Absence de gestion d'erreur sur JSON.parse (Bug 2)** : `loadTasks()` appelle `JSON.parse(stored)` directement sans bloc `try/catch`. Une valeur corrompue dans localStorage provoque une exception non interceptée.

3. **Appel redondant à renderTasks() (Bug 3)** : Le code d'initialisation en bas de `script.js` appelle `loadTasks()` puis `renderTasks()`. Or `loadTasks()` appelle déjà `sortTasks()` mais pas `renderTasks()` — le second appel explicite est donc superflu et doit être supprimé (un seul appel suffit après `loadTasks()`).

4. **Sélecteur :has() couplé à la structure interne (Bug 4)** : `deleteTask()` utilise un sélecteur qui dépend de l'attribut `onclick` du bouton enfant. Ce couplage fort casse dès que la structure change ou que les `onclick` sont supprimés (Bug 12).

5. **Entropie insuffisante dans la génération d'ID (Bug 5)** : `Date.now()` a une résolution de 1ms. Deux appels dans la même milliseconde retournent la même valeur.

6. **Retour silencieux sur titre vide (Bug 6)** : `addTask()` fait `if (!title) return;` sans aucune interaction avec l'UI pour informer l'utilisateur.

7. **Attribut required orphelin (Bug 7)** : L'attribut `required` sur `#task-title` n'a d'effet que dans un contexte `<form>` avec soumission native. Sans `<form>`, il est ignoré par le navigateur.

8. **Boutons sans contexte accessible (Bug 8)** : Les boutons sont créés avec uniquement leur texte visible ("Mark Completed", "Delete") sans `aria-label` incluant le titre de la tâche.

9. **Conteneur statique sans annonce dynamique (Bug 9)** : `#tasks` est un `<div>` ordinaire dans `index.html` sans attribut `aria-live`.

10. **Emojis CSS sans masquage (Bug 10)** : Les emojis sont générés via `::before` sur `.priority-icon` mais l'élément `<span class="priority-icon">` n'a pas `aria-hidden="true"`.

11. **Absence de reset box-sizing (Bug 11)** : `styles.css` ne définit pas de règle globale `box-sizing`. Le comportement par défaut (`content-box`) peut causer des débordements sur les inputs avec `width: 100%` et `padding`.

12. **Handlers inline dans le template (Bug 12)** : `renderTasks()` utilise un template literal avec `onclick="toggleComplete(${task.id})"` et `onclick="confirmDelete(${task.id})"` directement dans la chaîne HTML.

---

## Correctness Properties

Property 1: Bug Condition — Échappement XSS

_For any_ entrée `task` où `isBugCondition_XSS(task)` est vrai (titre ou description contenant des caractères HTML spéciaux), la fonction `renderTasks` corrigée SHALL afficher le texte brut sans interpréter le HTML, en utilisant `textContent` ou une fonction `escapeHtml()`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Affichage des tâches valides

_For any_ entrée `task` où `isBugCondition_XSS(task)` est faux (titre et description sans caractères HTML spéciaux), la fonction `renderTasks` corrigée SHALL produire le même résultat visuel que la fonction originale.

**Validates: Requirements 3.1**

Property 3: Bug Condition — Résilience au JSON corrompu

_For any_ valeur localStorage `v` où `isBugCondition_JSON(v)` est vrai (JSON invalide), la fonction `loadTasks` corrigée SHALL initialiser `tasks = []` et continuer à fonctionner sans crash.

**Validates: Requirements 2.3**

Property 4: Preservation — Chargement du localStorage valide

_For any_ valeur localStorage `v` où `isBugCondition_JSON(v)` est faux (JSON valide), la fonction `loadTasks` corrigée SHALL produire le même résultat que la fonction originale.

**Validates: Requirements 3.2**

Property 5: Bug Condition — Unicité des IDs

_For any_ paire de tâches `(t1, t2)` créées dans la même milliseconde où `isBugCondition_ID(t1, t2)` est vrai, la fonction `addTask` corrigée SHALL générer `t1.id ≠ t2.id`.

**Validates: Requirements 2.6**

Property 6: Preservation — IDs distincts dans le cas normal

_For any_ paire de tâches créées à des millisecondes différentes, la fonction `addTask` corrigée SHALL CONTINUE TO générer des IDs distincts.

**Validates: Requirements 3.5**

Property 7: Bug Condition — Feedback sur titre vide

_For any_ tentative d'ajout où `isBugCondition_EmptyTitle(input)` est vrai, la fonction `addTask` corrigée SHALL afficher un indicateur d'erreur visible sur le champ `#task-title`.

**Validates: Requirements 2.7**

Property 8: Preservation — Ajout normal avec titre valide

_For any_ tentative d'ajout où `isBugCondition_EmptyTitle(input)` est faux, la fonction `addTask` corrigée SHALL CONTINUE TO créer la tâche sans afficher d'erreur.

**Validates: Requirements 3.6**

---

## Fix Implementation

### Changes Required

#### File: `index.html`

**Bug 7 — Supprimer l'attribut `required`**
- Retirer `required` de `<input type="text" id="task-title" ...>`

**Bug 9 — Ajouter `aria-live` sur `#tasks`**
- Ajouter `aria-live="polite"` et `aria-label="Liste des tâches"` sur `<div id="tasks" class="tasks">`

#### File: `styles.css`

**Bug 11 — Ajouter `box-sizing: border-box` global**
- Ajouter en tête de fichier :
  ```css
  *, *::before, *::after {
    box-sizing: border-box;
  }
  ```

#### File: `script.js`

**Bug 1 — Créer `escapeHtml()` et l'utiliser dans `renderTasks()`**
- Ajouter en haut du fichier :
  ```javascript
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  ```
- Dans `renderTasks()`, remplacer `${task.title}` et `${task.desc}` par `${escapeHtml(task.title)}` et `${escapeHtml(task.desc)}`

**Bug 2 — Entourer JSON.parse d'un try/catch**
- Dans `loadTasks()`, remplacer :
  ```javascript
  tasks = JSON.parse(stored);
  ```
  par :
  ```javascript
  try {
    tasks = JSON.parse(stored);
  } catch (e) {
    tasks = [];
  }
  ```

**Bug 3 — Supprimer le second appel à renderTasks()**
- En bas du fichier, remplacer :
  ```javascript
  loadTasks();
  renderTasks();
  ```
  par :
  ```javascript
  loadTasks();
  renderTasks();
  ```
  → Concrètement : `loadTasks()` doit appeler `renderTasks()` en fin d'exécution, et le `renderTasks()` global doit être supprimé. Ou bien : garder `renderTasks()` global et supprimer l'appel dans `loadTasks()` (qui appelle `sortTasks()`). La solution la plus simple est de supprimer le `renderTasks()` standalone final et de l'appeler à la fin de `loadTasks()`.

**Bug 4 — Utiliser data-id sur l'élément .task**
- Dans `renderTasks()`, ajouter `data-id="${task.id}"` sur l'élément `.task` créé
- Dans `deleteTask(id)`, remplacer le sélecteur `:has()` par :
  ```javascript
  const taskEl = document.querySelector(`.task[data-id="${id}"]`);
  ```

**Bug 5 — Combiner Date.now() + Math.random()**
- Dans `addTask()`, remplacer :
  ```javascript
  id: Date.now(),
  ```
  par :
  ```javascript
  id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
  ```
  Note : les IDs existants en localStorage restent des nombres — la comparaison `t.id !== id` dans `filter` et `find` doit utiliser `==` (égalité faible) ou les IDs doivent être convertis en string de façon cohérente. Utiliser `String(task.id) === String(id)` dans `deleteTask`, `toggleComplete` et `filterTasks`.

**Bug 6 — Ajouter feedback visuel sur titre vide**
- Dans `addTask()`, remplacer `if (!title) return;` par :
  ```javascript
  if (!title) {
    const titleInput = document.getElementById('task-title');
    titleInput.classList.add('input-error');
    titleInput.focus();
    setTimeout(() => titleInput.classList.remove('input-error'), 2000);
    return;
  }
  ```
- Dans `styles.css`, ajouter :
  ```css
  .input-error {
    border-color: #e53e3e !important;
    box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.2) !important;
  }
  ```

**Bug 8 — Ajouter aria-label sur les boutons Complete/Delete**
- Dans `renderTasks()`, sur le bouton complete :
  ```javascript
  completeBtn.setAttribute('aria-label',
    task.status === 'completed'
      ? `Marquer comme en attente : ${escapeHtml(task.title)}`
      : `Marquer comme complétée : ${escapeHtml(task.title)}`
  );
  ```
- Sur le bouton delete :
  ```javascript
  deleteBtn.setAttribute('aria-label', `Supprimer : ${escapeHtml(task.title)}`);
  ```

**Bug 10 — Ajouter aria-hidden sur .priority-icon**
- Dans `renderTasks()`, lors de la création du span `.priority-icon`, ajouter `aria-hidden="true"` :
  ```javascript
  priorityIcon.setAttribute('aria-hidden', 'true');
  ```

**Bug 12 — Remplacer les onclick inline par addEventListener**
- Dans `renderTasks()`, ne plus utiliser de template literal pour les boutons. Créer les boutons via `document.createElement` et attacher les handlers :
  ```javascript
  const completeBtn = document.createElement('button');
  completeBtn.className = 'complete-btn';
  completeBtn.textContent = task.status === 'completed' ? 'Mark Pending' : 'Mark Completed';
  completeBtn.addEventListener('click', () => toggleComplete(task.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => confirmDelete(task.id));
  ```

---

## Testing Strategy

### Validation Approach

La stratégie suit deux phases : d'abord vérifier que les bugs sont bien reproductibles sur le code non corrigé (exploration), puis vérifier que les corrections fonctionnent et que les comportements existants sont préservés.

### Exploratory Bug Condition Checking

**Goal** : Reproduire chaque bug sur le code original pour confirmer l'analyse des causes racines.

**Test Cases** :
1. **XSS Test** : Créer une tâche avec titre `<img src=x onerror=alert(1)>` → observer l'exécution du script (échouera sur code non corrigé)
2. **JSON corrompu** : Mettre `localStorage.setItem('tasks', '{invalid}')` puis recharger → observer le crash
3. **Double render** : Ajouter un `console.log` dans `renderTasks()` et observer 2 appels au démarrage
4. **Sélecteur :has()** : Supprimer une tâche et observer si `taskEl` est null dans un navigateur sans `:has()`
5. **Collision ID** : Créer deux tâches en mockant `Date.now()` pour retourner la même valeur
6. **Titre vide** : Cliquer "Add Task" sans titre → observer l'absence de feedback

**Expected Counterexamples** :
- Script exécuté dans le DOM pour le bug XSS
- `Uncaught SyntaxError` dans la console pour le bug JSON
- `renderTasks` appelé 2 fois au démarrage
- `taskEl` null → `TypeError: Cannot read properties of null` pour le bug 4

### Fix Checking

**Goal** : Vérifier que pour toutes les entrées où la condition de bug est vraie, la fonction corrigée produit le comportement attendu.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal** : Vérifier que pour toutes les entrées où la condition de bug est fausse, la fonction corrigée produit le même résultat que la fonction originale.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach** : Les tests property-based sont recommandés pour la vérification de préservation car ils génèrent automatiquement de nombreux cas de test et détectent les régressions sur des entrées inattendues.

### Unit Tests

- Tester `escapeHtml()` avec des chaînes contenant `<`, `>`, `&`, `"`, `'` et des chaînes normales
- Tester `loadTasks()` avec un localStorage valide, invalide, et vide
- Tester `addTask()` avec un titre vide (feedback attendu) et un titre valide (tâche créée)
- Tester `deleteTask(id)` avec un `data-id` présent et absent
- Tester la génération d'IDs : créer 1000 tâches et vérifier l'unicité

### Property-Based Tests

- Générer des titres aléatoires contenant des caractères HTML et vérifier que `escapeHtml()` produit toujours du texte sûr (pas de balises interprétées)
- Générer des paires de tâches créées simultanément et vérifier `t1.id ≠ t2.id`
- Générer des valeurs localStorage aléatoires (valides et invalides) et vérifier que `loadTasks()` ne crash jamais
- Générer des tâches avec titres valides et vérifier que le rendu après correction est identique au rendu original (préservation)

### Integration Tests

- Flux complet : créer une tâche avec titre XSS → vérifier affichage texte brut → compléter → supprimer
- Flux complet : corrompre localStorage → recharger → vérifier liste vide sans crash → créer une tâche
- Flux complet : créer plusieurs tâches → filtrer → trier → vérifier que les résultats sont corrects
- Vérifier que le mode sombre s'applique correctement après toutes les corrections
- Vérifier que les lecteurs d'écran (via audit axe-core) ne signalent plus les problèmes aria
