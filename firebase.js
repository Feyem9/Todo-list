import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCKLepYhoGlgUT9KlkEn4JP1DFC5hi5ZDE",
  authDomain: "todo-list-29d44.firebaseapp.com",
  projectId: "todo-list-29d44",
  storageBucket: "todo-list-29d44.firebasestorage.app",
  messagingSenderId: "578991937240",
  appId: "1:578991937240:web:9215b9fc3c33395759e9ad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const tasksCol = collection(db, 'tasks');

// Charger toutes les tâches depuis Firestore
window.fbLoadTasks = async function () {
  const q = query(tasksCol, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
};

// Ajouter une tâche
window.fbAddTask = async function (task) {
  const docRef = await addDoc(tasksCol, { ...task, createdAt: Date.now() });
  return docRef.id;
};

// Mettre à jour une tâche (status, etc.)
window.fbUpdateTask = async function (firestoreId, data) {
  await updateDoc(doc(db, 'tasks', firestoreId), data);
};

// Supprimer une tâche
window.fbDeleteTask = async function (firestoreId) {
  await deleteDoc(doc(db, 'tasks', firestoreId));
};
