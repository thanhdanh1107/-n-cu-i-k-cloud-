

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// CẤU HÌNH FIREBASE CỦA BẠN (Thay bằng các thông số chuẩn của bạn)
const firebaseConfig = {
    apiKey: "744a01ba17c7496ca4d41519260307", // Đảm bảo các dòng cấu hình này chính xác
    authDomain: "cloud-bf475.firebaseapp.com",
    projectId: "cloud-bf475",
    storageBucket: "cloud-bf475.firebasestorage.app",
    messagingSenderId: "1096508316195",
    appId: "G-YFZD6CJXW1"
};

// Khởi tạo các dịch vụ của Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Xuất bản (Export) để file script.js có thể import vào sử dụng
export { auth, db };