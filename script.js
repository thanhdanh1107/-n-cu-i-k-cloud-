import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, addDoc, getDocs, query, where, deleteDoc, doc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const API_KEY = '744a01ba17c7496ca4d41519260307'; 
let isLoginMode = true; 
let currentUser = null; 
let currentCityFetched = ""; 

// --- 1. ĐĂNG NHẬP / ĐĂNG KÝ (GIAO DIỆN MODAL) ---
const authModal = document.getElementById('authModal');
const authError = document.getElementById('authError');

document.getElementById('showAuthBtn').addEventListener('click', () => authModal.classList.remove('hidden'));
document.getElementById('closeModal').addEventListener('click', () => {
    authModal.classList.add('hidden'); authError.classList.add('hidden');
});

document.getElementById('switchAuthMode').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Đăng Nhập" : "Đăng Ký Mới";
    document.getElementById('submitAuthBtn').innerText = isLoginMode ? "Đăng Nhập" : "Tạo Tài Khoản";
    document.getElementById('authSwitchText').innerText = isLoginMode ? "Chưa có tài khoản?" : "Đã có tài khoản?";
    document.getElementById('switchAuthMode').innerText = isLoginMode ? "Đăng ký ngay" : "Đăng nhập ngay";
    authError.classList.add('hidden');
});

document.getElementById('submitAuthBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!email || !password) {
        authError.innerText = "Vui lòng nhập đầy đủ thông tin!"; authError.classList.remove('hidden'); return;
    }
    try {
        if (isLoginMode) { await signInWithEmailAndPassword(auth, email, password); } 
        else { await createUserWithEmailAndPassword(auth, email, password); }
        authModal.classList.add('hidden'); authError.classList.add('hidden');
    } catch (error) {
        authError.innerText = "Lỗi: " + error.message; authError.classList.remove('hidden');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

// Theo dõi liên tục trạng thái Đăng nhập / Đăng xuất của User
onAuthStateChanged(auth, (user) => {
    const userDataSection = document.getElementById('userDataSection');
    if (user) {
        currentUser = user;
        document.getElementById('loggedOutView').classList.add('hidden');
        document.getElementById('loggedInView').classList.remove('hidden');
        document.getElementById('userEmailDisplay').innerText = user.email;
        userDataSection.classList.remove('hidden');
        loadSearchHistory();
        loadFavorites();
    } else {
        currentUser = null;
        document.getElementById('loggedOutView').classList.remove('hidden');
        document.getElementById('loggedInView').classList.add('hidden');
        userDataSection.classList.add('hidden');
        document.getElementById('favBtn').innerText = "☆";
    }
});

// --- 2. LOGIC LƯU TRỮ VÀ XỬ LÝ DATABASE (FIRESTORE) ---

// Lưu lịch sử tra cứu của user
async function saveToHistory(cityName) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, "search_history"), {
            userId: currentUser.uid,
            cityName: cityName,
            timestamp: serverTimestamp()
        });
        loadSearchHistory();
    } catch (e) { console.error("Lỗi lưu lịch sử: ", e); }
}

// Tải lịch sử tra cứu (Hiện tối đa 5 địa điểm mới nhất, lọc trùng)
async function loadSearchHistory() {
    if (!currentUser) return;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    try {
        const q = query(collection(db, "search_history"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        let docsData = [];
        querySnapshot.forEach(doc => docsData.push(doc.data()));
        
        // Sắp xếp thời gian client-side tránh lỗi cài đặt index của Firebase
        docsData.sort((a, b) => {
            const timeA = a.timestamp?.seconds || Date.now() / 1000;
            const timeB = b.timestamp?.seconds || Date.now() / 1000;
            return timeB - timeA;
        });
        
        // Chỉ lấy tối đa 5 thành phố duy nhất, không trùng tên sát nhau
        let uniqueCities = [];
        for (let doc of docsData) {
            if (!uniqueCities.includes(doc.cityName)) {
                uniqueCities.push(doc.cityName);
            }
            if (uniqueCities.length >= 5) break;
        }

        uniqueCities.forEach(cityName => {
            const li = document.createElement('li');
            li.innerText = cityName;
            li.addEventListener('click', () => {
                document.getElementById('cityInput').value = cityName;
                getWeather();
            });
            historyList.appendChild(li);
        });
    } catch (e) { console.error("Lỗi lấy lịch sử: ", e); }
}

// Nhấn nút Trái tim (Thêm / Xóa khỏi danh sách yêu thích)
document.getElementById('favBtn').addEventListener('click', async () => {
    if (!currentUser) { alert("Vui lòng đăng nhập để sử dụng tính năng Yêu thích!"); return; }
    if (!currentCityFetched) return;

    try {
        const favRef = collection(db, "favorites");
        const q = query(favRef, where("userId", "==", currentUser.uid), where("cityName", "==", currentCityFetched));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Đã tồn tại -> Tiến hành Hủy thích (Xóa khỏi Firestore)
            querySnapshot.forEach(async (documentRecord) => {
                await deleteDoc(doc(db, "favorites", documentRecord.id));
            });
            document.getElementById('favBtn').innerText = "☆";
        } else {
            // Chưa tồn tại -> Tiến hành Thêm thích (Ghi vào Firestore)
            await addDoc(favRef, {
                userId: currentUser.uid,
                cityName: currentCityFetched,
                addedAt: serverTimestamp()
            });
            document.getElementById('favBtn').innerText = "❤";
        }
        loadFavorites(); 
    } catch (e) { console.error("Lỗi xử lý yêu thích: ", e); }
});

// Tải và hiển thị danh sách Yêu thích
async function loadFavorites() {
    if (!currentUser) return;
    const favoritesList = document.getElementById('favoritesList');
    favoritesList.innerHTML = '';
    let isCurrentCityFav = false;

    try {
        const q = query(collection(db, "favorites"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((documentRecord) => {
            const data = documentRecord.data();
            if (data.cityName === currentCityFetched) isCurrentCityFav = true;

            const li = document.createElement('li');
            li.innerHTML = `<span>${data.cityName}</span> <span class="delete-item-btn">&times;</span>`;
            
            // Bấm vào chữ để tra cứu nhanh
            li.querySelector('span').addEventListener('click', () => {
                document.getElementById('cityInput').value = data.cityName;
                getWeather();
            });
            // Bấm vào dấu x để xóa khỏi danh sách
            li.querySelector('.delete-item-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteDoc(doc(db, "favorites", documentRecord.id));
                loadFavorites();
                if (data.cityName === currentCityFetched) document.getElementById('favBtn').innerText = "☆";
            });

            favoritesList.appendChild(li);
        });

        document.getElementById('favBtn').innerText = isCurrentCityFav ? "❤" : "☆";
    } catch (e) { console.error("Lỗi lấy danh sách yêu thích: ", e); }
}

// --- 3. LOGIC GỌI API THỜI TIẾT ---
async function getWeather() {
    const cityInput = document.getElementById('cityInput');
    const weatherResult = document.getElementById('weatherResult');
    const validationMessage = document.getElementById('validationMessage');
    const errorMessage = document.getElementById('errorMessage');
    const city = cityInput.value.trim();

    validationMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');

    if (!city) {
        validationMessage.innerText = "Vui lòng nhập tên thành phố!"; validationMessage.classList.remove('hidden');
        weatherResult.classList.add('hidden'); return;
    }

    const cityRegex = /^[^0-9`~!@#$%^&*()_+\-=\[\]{};':",./<>?|\\\n]+$/;
    if (!cityRegex.test(city)) {
        validationMessage.innerText = "Tên thành phố không chứa số hoặc ký tự đặc biệt!";
        validationMessage.classList.remove('hidden'); weatherResult.classList.add('hidden'); return;
    }

    const encodedCity = encodeURIComponent(city);
    const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodedCity}&lang=vi`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            weatherResult.classList.remove('hidden');
            currentCityFetched = data.location.name; // Lưu lại tên chuẩn của API

            document.getElementById('cityName').innerText = data.location.name;
            document.getElementById('countryName').innerText = `${data.location.region ? data.location.region + ', ' : ''}${data.location.country}`;
            document.getElementById('temperature').innerText = `${Math.round(data.current.temp_c)}°C`;
            document.getElementById('description').innerText = data.current.condition.text;
            document.getElementById('humidity').innerText = `${data.current.humidity}%`;
            document.getElementById('wind').innerText = `${data.current.wind_kph} km/h`;
            
            const weatherIcon = document.getElementById('weatherIcon');
            weatherIcon.src = "https:" + data.current.condition.icon;
            weatherIcon.classList.remove('hidden');

            // Kích hoạt ghi lịch sử và kiểm tra đồng bộ yêu thích
            saveToHistory(data.location.name);
            if (currentUser) loadFavorites(); 
        } else {
            weatherResult.classList.add('hidden'); errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Lỗi kết nối: ", error);
        alert("Đã xảy ra lỗi kết nối với máy chủ thời tiết.");
    }
}

document.getElementById('searchBtn').addEventListener('click', getWeather);
document.getElementById('cityInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') getWeather();
});