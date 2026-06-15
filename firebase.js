import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCMI6HCjBynguXdws8NPUI8Doo0DSPRs8E",
  authDomain: "schedule-e92d3.firebaseapp.com",
  projectId: "schedule-e92d3",
  storageBucket: "schedule-e92d3.firebasestorage.app",
  messagingSenderId: "682505204420",
  appId: "1:682505204420:web:e282325e2667cff668cf91",
  measurementId: "G-C8HVL5F3MG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
