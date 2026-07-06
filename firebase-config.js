// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD8lZMCSoGfkuQsONFfZeJNpYKvaO-8SF4",
  authDomain: "cloud-bf475.firebaseapp.com",
  projectId: "cloud-bf475",
  storageBucket: "cloud-bf475.firebasestorage.app",
  messagingSenderId: "1096508316195",
  appId: "1:1096508316195:web:5904ef71dfb06f2e75ef96",
  measurementId: "G-YFZD6CJXW1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);