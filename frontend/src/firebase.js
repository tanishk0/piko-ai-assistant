import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "agent-builder-6b68c.firebaseapp.com",
  projectId: "agent-builder-6b68c",
  storageBucket: "agent-builder-6b68c.firebasestorage.app",
  messagingSenderId: "267392527695",
  appId: "1:267392527695:web:0f7ff29a3c6688c1aca93a",
  measurementId: "G-3F7VKNK86D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

