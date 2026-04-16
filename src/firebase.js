// ─────────────────────────────────────────────
// Firebase Configuration
// Replace with your own Firebase project config
// ─────────────────────────────────────────────
// How to get this:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Add a Web App
// 4. Copy the firebaseConfig object here
// 5. In Firestore: create database in "test mode" (can lock down later)

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCElGk_7ssUlZ2PK1SPcTcK8el7vLyYqeE",
  authDomain: "krtrainer.firebaseapp.com",
  projectId: "krtrainer",
  storageBucket: "krtrainer.firebasestorage.app",
  messagingSenderId: "1095564303120",
  appId: "1:1095564303120:web:a756d407970b97ae832395"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
