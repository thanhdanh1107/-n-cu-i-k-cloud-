// Import các hàm từ thư viện Firebase
import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const API_KEY = '744a01ba17c7496ca4d41519260307'; 
let isLoginMode = true; // Biến kiểm tra đang ở form Đăng nhập hay Đăng ký
let currentUser = null; // Biến lưu thông tin người dùng đang đăng nhập

// --- 1. XỬ LÝ GIAO DIỆN AUTH ---
const authModal = document.getElementById('authModal');
const authError = document.getElementById('authError');

document.getElementById('showAuthBtn').addEventListener('click', () => authModal.classList.remove('hidden'));
document.getElementById('closeModal').addEventListener('click', () => {
    authModal.classList.add('hidden');
    authError.classList.add('hidden');
});

// Chuyển đổi qua lại giữa Đăng nhập và Đăng ký
document.getElementById('switchAuthMode').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Đăng Nhập" : "Đăng Ký Mới";
    document.getElementById('submitAuthBtn').innerText = isLoginMode ? "Đăng Nhập" : "Tạo Tài Khoản";
    document.getElementById('authSwitchText').innerText = isLoginMode ? "Chưa có tài khoản?" : "Đã có tài khoản?";
    document.getElementById('switchAuthMode').innerText = isLoginMode ? "Đăng ký ngay" : "Đăng nhập ngay";
    authError.classList.add('hidden');
});

// --- 2. LOGIC ĐĂNG NHẬP / ĐĂNG KÝ VỚI FIREBASE ---
document.getElementById('submitAuthBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;

    if (!email || !password) {
        authError.innerText = "Vui lòng nhập đầy đủ Email và Mật khẩu!";
        authError.classList.remove('hidden');
        return;
    }

    try {
        if (isLoginMode) {
            // Thực hiện Đăng nhập
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            // Thực hiện Đăng ký
            await createUserWithEmailAndPassword(auth, email, password);
        }
        authModal.classList.add('hidden'); // Đóng form nếu thành công
        authError.classList.add('hidden');
    } catch (error) {
        console.error(error);
        authError.innerText = "Lỗi: " + error.message; // Báo lỗi (sai mật khẩu, email tồn tại...)
        authError.classList.remove('hidden');
    }
});

// Đăng xuất
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// Lắng nghe trạng thái đăng nhập liên tục (Rất quan trọng)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Đã đăng nhập
        currentUser = user;
        document.getElementById('loggedOutView').classList.add('hidden');
        document.getElementById('loggedInView').classList.remove('hidden');
        document.getElementById('userEmailDisplay').innerText = user.email;
    } else {
        // Chưa đăng nhập
        currentUser = null;
        document.getElementById('loggedOutView').classList.remove('hidden');
        document.getElementById('loggedInView').classList.add('hidden');
    }
});

// --- 3. LOGIC GỌI API THỜI TIẾT (GIỮ NGUYÊN TỪ TRƯỚC) ---
async function getWeather() {
    const cityInput = document.getElementById('cityInput');
    const weatherResult = document.getElementById('weatherResult');
    const validationMessage = document.getElementById('validationMessage');
    const errorMessage = document.getElementById('errorMessage');
    const city = cityInput.value.trim();

    validationMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');

    if (!city) {
        validationMessage.innerText = "Vui lòng nhập tên thành phố!";
        validationMessage.classList.remove('hidden');
        weatherResult.classList.add('hidden');
        return;
    }

    const cityRegex = /^[^0-9`~!@#$%^&*()_+\-=\[\]{};':",./<>?|\\\n]+$/;
    if (!cityRegex.test(city)) {
        validationMessage.innerText = "Tên thành phố không chứa chữ số hoặc ký tự đặc biệt!";
        validationMessage.classList.remove('hidden');
        weatherResult.classList.add('hidden');
        return;
    }

    const encodedCity = encodeURIComponent(city);
    const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodedCity}&lang=vi`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            weatherResult.classList.remove('hidden');
            document.getElementById('cityName').innerText = data.location.name;
            document.getElementById('countryName').innerText = `${data.location.region ? data.location.region + ', ' : ''}${data.location.country}`;
            document.getElementById('temperature').innerText = `${Math.round(data.current.temp_c)}°C`;
            document.getElementById('description').innerText = data.current.condition.text;
            document.getElementById('humidity').innerText = `${data.current.humidity}%`;
            document.getElementById('wind').innerText = `${data.current.wind_kph} km/h`;
            
            const weatherIcon = document.getElementById('weatherIcon');
            weatherIcon.src = "https:" + data.current.condition.icon;
            weatherIcon.classList.remove('hidden');
            
            // Ở bước sau, chúng ta sẽ thêm code lưu Lịch sử tìm kiếm vào Firebase tại đây!
        } else {
            weatherResult.classList.add('hidden');
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Lỗi mạng: ", error);
        alert("Đã xảy ra lỗi kết nối với máy chủ thời tiết.");
    }
}

// Gắn sự kiện click và enter (thay vì dùng onclick trong HTML)
document.getElementById('searchBtn').addEventListener('click', getWeather);
document.getElementById('cityInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') getWeather();
});