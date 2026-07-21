import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD8lZMCSoGfkuQsONFfZeJNpYKvaO-8SF4",
    authDomain: "cloud-bf475.firebaseapp.com",
    projectId: "cloud-bf475",
    storageBucket: "cloud-bf475.firebasestorage.app",
    messagingSenderId: "1096508316195",
    appId: "1:1096508316195:web:5904ef71dfb06f2e75ef96",
    measurementId: "G-YFZD6CJXW1"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };