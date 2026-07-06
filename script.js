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

// --- 1. XỬ LÝ AUTH INTERFACE (ĐĂNG NHẬP / ĐĂNG KÝ) ---
const authModal = document.getElementById('authModal');
const authError = document.getElementById('authError');
const mainApp = document.getElementById('mainApp'); // Trỏ tới app thời tiết

// Xử lý chuyển đổi giữa Đăng nhập và Đăng ký
document.getElementById('switchAuthMode').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Đăng Nhập" : "Đăng Ký Mới";
    document.getElementById('submitAuthBtn').innerText = isLoginMode ? "Đăng Nhập" : "Tạo Tài Khoản";
    document.getElementById('authSwitchText').innerText = isLoginMode ? "Chưa có tài khoản?" : "Đã có tài khoản?";
    document.getElementById('switchAuthMode').innerText = isLoginMode ? "Đăng ký ngay" : "Đăng nhập ngay";
    authError.classList.add('hidden');
});

// Xử lý nút Submit
document.getElementById('submitAuthBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!email || !password) {
        authError.innerText = "Vui lòng nhập đầy đủ thông tin!"; authError.classList.remove('hidden'); return;
    }
    try {
        if (isLoginMode) { await signInWithEmailAndPassword(auth, email, password); } 
        else { await createUserWithEmailAndPassword(auth, email, password); }
        authError.classList.add('hidden');
    } catch (error) {
        authError.innerText = "Lỗi: " + error.message; authError.classList.remove('hidden');
    }
});

// Nút Đăng xuất
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

// --- BỘ ĐIỀU KHIỂN TRUNG TÂM ---
// Kiểm tra trạng thái User liên tục để quyết định màn hình nào được hiện ra
onAuthStateChanged(auth, (user) => {
    const userDataSection = document.getElementById('userDataSection');
    
    if (user) {
        // NẾU ĐÃ ĐĂNG NHẬP THÀNH CÔNG:
        currentUser = user;
        authModal.classList.add('hidden');    // Giấu bảng đăng nhập
        mainApp.classList.remove('hidden');   // HIỆN APP THỜI TIẾT
        
        document.getElementById('loggedOutView').classList.add('hidden');
        document.getElementById('loggedInView').classList.remove('hidden');
        document.getElementById('userEmailDisplay').innerText = user.email;
        userDataSection.classList.remove('hidden');
        
        // Tải dữ liệu cá nhân
        loadSearchHistory();
        loadFavorites();
    } else {
        // NẾU CHƯA ĐĂNG NHẬP / VỪA ĐĂNG XUẤT:
        currentUser = null;
        authModal.classList.remove('hidden'); // HIỆN BẢNG ĐĂNG NHẬP LÊN ĐẦU
        mainApp.classList.add('hidden');      // Giấu app thời tiết đi
        
        document.getElementById('loggedOutView').classList.remove('hidden');
        document.getElementById('loggedInView').classList.add('hidden');
        userDataSection.classList.add('hidden');
        document.getElementById('favBtn').innerText = "☆";
        
        // Reset lại form đăng nhập
        document.getElementById('emailInput').value = "";
        document.getElementById('passwordInput').value = "";
    }
});

// --- 2. XỬ LÝ DATABASE CHUYÊN SÂU ---
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

async function loadSearchHistory() {
    if (!currentUser) return;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    try {
        const q = query(collection(db, "search_history"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        let docsData = [];
        querySnapshot.forEach(doc => docsData.push(doc.data()));
        
        docsData.sort((a, b) => {
            const timeA = a.timestamp?.seconds || Date.now() / 1000;
            const timeB = b.timestamp?.seconds || Date.now() / 1000;
            return timeB - timeA;
        });
        
        let uniqueCities = [];
        for (let doc of docsData) {
            if (!uniqueCities.includes(doc.cityName)) uniqueCities.push(doc.cityName);
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
    } catch (e) { console.error("Lỗi tải lịch sử: ", e); }
}

document.getElementById('favBtn').addEventListener('click', async () => {
    if (!currentUser) return;
    if (!currentCityFetched) return;

    try {
        const favRef = collection(db, "favorites");
        const q = query(favRef, where("userId", "==", currentUser.uid), where("cityName", "==", currentCityFetched));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach(async (documentRecord) => {
                await deleteDoc(doc(db, "favorites", documentRecord.id));
            });
            document.getElementById('favBtn').innerText = "☆";
        } else {
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
            
            li.querySelector('span').addEventListener('click', () => {
                document.getElementById('cityInput').value = data.cityName;
                getWeather();
            });
            li.querySelector('.delete-item-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteDoc(doc(db, "favorites", documentRecord.id));
                loadFavorites();
                if (data.cityName === currentCityFetched) document.getElementById('favBtn').innerText = "☆";
            });

            favoritesList.appendChild(li);
        });

        document.getElementById('favBtn').innerText = isCurrentCityFav ? "❤" : "☆";
    } catch (e) { console.error("Lỗi tải danh sách yêu thích: ", e); }
}

// --- 3. ĐỊNH TUYẾN API THỜI TIẾT ---
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
            currentCityFetched = data.location.name;

            document.getElementById('cityName').innerText = data.location.name;
            document.getElementById('countryName').innerText = `${data.location.region ? data.location.region + ', ' : ''}${data.location.country}`;
            document.getElementById('temperature').innerText = `${Math.round(data.current.temp_c)}°C`;
            document.getElementById('description').innerText = data.current.condition.text;
            document.getElementById('humidity').innerText = `${data.current.humidity}%`;
            document.getElementById('wind').innerText = `${data.current.wind_kph} km/h`;
            
            const weatherIcon = document.getElementById('weatherIcon');
            weatherIcon.src = "https:" + data.current.condition.icon;
            weatherIcon.classList.remove('hidden');

            saveToHistory(data.location.name);
            loadFavorites(); 
        } else {
            weatherResult.classList.add('hidden'); errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Lỗi: ", error);
        alert("Đã xảy ra lỗi kết nối với máy chủ thời tiết.");
    }
}

document.getElementById('searchBtn').addEventListener('click', getWeather);
document.getElementById('cityInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') getWeather();
});