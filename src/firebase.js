import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpE8d0tYEdJ8AQzNsvAXz6h1OpMuGUXBY",
  authDomain: "magazzino-gronell.firebaseapp.com",
  projectId: "magazzino-gronell",
  storageBucket: "magazzino-gronell.firebasestorage.app",
  messagingSenderId: "145338158231",
  appId: "1:145338158231:web:3c01204a389fefffc1edd2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
