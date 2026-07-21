import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================================================
   1. CẤU HÌNH CHUNG
   ========================================================= */

const WEATHER_API_KEY = "744a01ba17c7496ca4d41519260307";

const WEATHER_API_URL =
    "https://api.weatherapi.com/v1/forecast.json";

const FORECAST_DAYS = 7;

const DEFAULT_LOCATION = {
    city: "Ho Chi Minh",
    latitude: 16.047079,
    longitude: 108.20623,
    zoom: 5
};


/* =========================================================
   2. BIẾN TRẠNG THÁI
   ========================================================= */

let currentUser = null;
let currentCityFetched = "";
let currentLocationRecord = null;
let isLoginMode = true;

let weatherMap = null;
let weatherMarker = null;
let toastTimer = null;


/* =========================================================
   3. HÀM LẤY PHẦN TỬ HTML
   ========================================================= */

const getElement = (id) => document.getElementById(id);


/* =========================================================
   4. KHỞI TẠO ỨNG DỤNG
   ========================================================= */

function initializeAppInterface() {
    initializeMap();
    bindInterfaceEvents();
    initializeAuthenticationListener();

    getWeather(DEFAULT_LOCATION.city, {
        saveHistory: false,
        showSuccessToast: false
    });
}


/* =========================================================
   5. KHỞI TẠO BẢN ĐỒ LEAFLET
   ========================================================= */

function initializeMap() {
    if (typeof window.L === "undefined") {
        showErrorMessage(
            "Không thể tải thư viện bản đồ. Vui lòng kiểm tra kết nối mạng."
        );
        return;
    }

    weatherMap = L.map("weatherMap", {
        zoomControl: false,
        attributionControl: true
    }).setView(
        [
            DEFAULT_LOCATION.latitude,
            DEFAULT_LOCATION.longitude
        ],
        DEFAULT_LOCATION.zoom
    );

    L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
    ).addTo(weatherMap);

    L.control.zoom({
        position: "bottomright"
    }).addTo(weatherMap);

    window.setTimeout(() => {
        weatherMap.invalidateSize();
    }, 250);
}


/* =========================================================
   6. ĐIỀU KHIỂN BẢN ĐỒ
   ========================================================= */

function zoomMapIn() {
    weatherMap?.zoomIn();
}


function zoomMapOut() {
    weatherMap?.zoomOut();
}


function resetMapView() {
    if (!weatherMap) {
        return;
    }

    if (currentLocationRecord) {
        weatherMap.setView(
            [
                currentLocationRecord.latitude,
                currentLocationRecord.longitude
            ],
            9,
            {
                animate: true
            }
        );

        return;
    }

    weatherMap.setView(
        [
            DEFAULT_LOCATION.latitude,
            DEFAULT_LOCATION.longitude
        ],
        DEFAULT_LOCATION.zoom,
        {
            animate: true
        }
    );
}


function updateMapLocation(location, currentWeather) {
    if (!weatherMap) {
        return;
    }

    const latitude = Number(location.lat);
    const longitude = Number(location.lon);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    weatherMap.setView(
        [latitude, longitude],
        9,
        {
            animate: true
        }
    );

    if (weatherMarker) {
        weatherMarker.setLatLng([
            latitude,
            longitude
        ]);
    } else {
        weatherMarker = L.marker([
            latitude,
            longitude
        ]).addTo(weatherMap);
    }

    weatherMarker
        .bindPopup(`
            <strong>${escapeHtml(location.name)}</strong><br>
            ${escapeHtml(location.country || "")}<br>
            ${Math.round(currentWeather.temp_c)}°C -
            ${escapeHtml(currentWeather.condition?.text || "")}
        `)
        .openPopup();

    window.setTimeout(() => {
        weatherMap.invalidateSize();
    }, 250);
}


/* =========================================================
   7. KIỂM TRA DỮ LIỆU TÌM KIẾM
   ========================================================= */

async function searchWeatherByInput() {
    const cityInput = getElement("cityInput");
    const city = cityInput.value.trim();

    hideMessages();

    if (!city) {
        showValidationMessage(
            "Vui lòng nhập tên thành phố cần tra cứu."
        );

        cityInput.focus();
        return;
    }

    if (city.length > 80) {
        showValidationMessage(
            "Tên thành phố quá dài. Vui lòng kiểm tra lại."
        );

        cityInput.focus();
        return;
    }

    /*
        Cho phép:
        - Chữ tiếng Việt
        - Chữ tiếng Anh
        - Khoảng trắng
        - Dấu gạch ngang
        - Dấu nháy đơn

        Không cho phép:
        - Số
        - Các ký tự đặc biệt như @, #, $, %, *, ...
    */
    const cityNameRegex =
        /^[A-Za-zÀ-ỹĐđ\s'-]+$/u;

    if (!cityNameRegex.test(city)) {
        showValidationMessage(
            "Tên thành phố không được chứa số hoặc ký tự đặc biệt."
        );

        cityInput.focus();
        return;
    }

    await getWeather(city);
}


/* =========================================================
   8. GỌI WEATHERAPI
   ========================================================= */

async function getWeather(
    locationQuery,
    options = {}
) {
    const {
        saveHistory = true,
        showSuccessToast = true
    } = options;

    hideMessages();

    const normalizedQuery =
        String(locationQuery ?? "").trim();

    if (!normalizedQuery) {
        showValidationMessage(
            "Vui lòng nhập tên thành phố."
        );

        return;
    }

    setLoadingState(true);

    const requestUrl =
        new URL(WEATHER_API_URL);

    requestUrl.searchParams.set(
        "key",
        WEATHER_API_KEY
    );

    requestUrl.searchParams.set(
        "q",
        normalizedQuery
    );

    requestUrl.searchParams.set(
        "days",
        String(FORECAST_DAYS)
    );

    requestUrl.searchParams.set(
        "aqi",
        "yes"
    );

    requestUrl.searchParams.set(
        "alerts",
        "no"
    );

    requestUrl.searchParams.set(
        "lang",
        "vi"
    );

    try {
        const response = await fetch(
            requestUrl.toString()
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                getWeatherApiErrorMessage(data)
            );
        }

        renderWeatherData(data);

        getElement("cityInput").value =
            data.location.name;

        if (
            currentUser &&
            saveHistory
        ) {
            await saveToSearchHistory(
                data.location
            );
        }

        if (currentUser) {
            await loadFavorites();
        }

        if (showSuccessToast) {
            showToast(
                `Đã cập nhật thời tiết tại ${data.location.name}.`,
                "success"
            );
        }
    } catch (error) {
        console.error(
            "Lỗi lấy dữ liệu thời tiết:",
            error
        );

        showErrorMessage(
            error.message ||
            "Không thể kết nối đến máy chủ thời tiết."
        );
    } finally {
        setLoadingState(false);
    }
}


/* =========================================================
   9. THÔNG BÁO LỖI API
   ========================================================= */

function getWeatherApiErrorMessage(data) {
    const errorCode =
        Number(data?.error?.code);

    const messages = {
        1002:
            "WeatherAPI chưa nhận được API key.",

        1003:
            "Vui lòng nhập tên thành phố cần tra cứu.",

        1005:
            "Địa chỉ gọi API không hợp lệ.",

        1006:
            "Không tìm thấy thành phố. Vui lòng kiểm tra lại tên địa điểm.",

        2006:
            "API key WeatherAPI không hợp lệ.",

        2007:
            "API key đã vượt quá giới hạn truy cập cho phép.",

        2008:
            "API key đã bị vô hiệu hóa.",

        2009:
            "Gói WeatherAPI hiện tại không hỗ trợ tài nguyên này.",

        9999:
            "WeatherAPI đang gặp lỗi hệ thống. Vui lòng thử lại sau."
    };

    return (
        messages[errorCode] ||
        data?.error?.message ||
        "Không thể tải dữ liệu thời tiết."
    );
}


/* =========================================================
   10. HIỂN THỊ TOÀN BỘ DỮ LIỆU
   ========================================================= */

function renderWeatherData(data) {
    const location = data.location;
    const current = data.current;

    const forecastDays =
        data.forecast?.forecastday || [];

    const todayForecast =
        forecastDays[0] || null;

    currentCityFetched = location.name;

    currentLocationRecord = {
        cityName: location.name,
        region: location.region || "",
        country: location.country || "",

        latitude:
            Number(location.lat),

        longitude:
            Number(location.lon),

        searchQuery:
            `${location.lat},${location.lon}`,

        locationKey:
            createLocationKey({
                cityName: location.name,
                region: location.region,
                country: location.country
            })
    };

    renderCurrentWeather(
        location,
        current,
        todayForecast
    );

    renderHourlyForecast(
        forecastDays,
        location
    );

    renderDailyForecast(
        forecastDays
    );

    renderAirQuality(
        current.air_quality
    );

    updateMapLocation(
        location,
        current
    );

    getElement("weatherResult")
        .classList.remove("hidden");
}


/* =========================================================
   11. THỜI TIẾT HIỆN TẠI
   ========================================================= */

function renderCurrentWeather(
    location,
    current,
    todayForecast
) {
    const regionCountry = [
        location.region,
        location.country
    ]
        .filter(Boolean)
        .join(", ");

    setText(
        "cityName",
        location.name || "--"
    );

    setText(
        "countryName",
        regionCountry || "--"
    );

    setText(
        "localTime",
        location.localtime
            ? `Thời gian địa phương: ${location.localtime}`
            : "Thời gian địa phương: --"
    );

    setText(
        "temperature",
        `${Math.round(current.temp_c)}°`
    );

    setText(
        "description",
        current.condition?.text ||
        "Chưa có dữ liệu"
    );

    setText(
        "feelsLike",
        `${Math.round(current.feelslike_c)}°C`
    );

    setText(
        "humidity",
        `${current.humidity}%`
    );

    setText(
        "wind",
        `${formatNumber(current.wind_kph, 1)} km/h`
    );

    setText(
        "pressure",
        `${Math.round(current.pressure_mb)} hPa`
    );

    setText(
        "visibility",
        `${formatNumber(current.vis_km, 1)} km`
    );

    setText(
        "uvIndex",
        formatNumber(current.uv, 1)
    );

    setText(
        "uvStatus",
        getUvStatus(current.uv)
    );

    setText(
        "precipitation",
        `${formatNumber(current.precip_mm, 1)} mm`
    );

    setText(
        "windDirection",
        current.wind_dir || "--"
    );

    setText(
        "windDegree",
        Number.isFinite(Number(current.wind_degree))
            ? `${current.wind_degree}°`
            : "--°"
    );

    setText(
        "cloudCover",
        `${current.cloud ?? "--"}%`
    );

    setText(
        "sunrise",
        todayForecast?.astro?.sunrise ||
        "--:--"
    );

    setText(
        "sunset",
        todayForecast?.astro?.sunset ||
        "--:--"
    );

    setText(
        "weatherUpdatedTime",
        current.last_updated
            ? `Cập nhật: ${current.last_updated}`
            : "Cập nhật: --"
    );

    const weatherIcon =
        getElement("weatherIcon");

    const iconUrl =
        normalizeWeatherIconUrl(
            current.condition?.icon
        );

    if (iconUrl) {
        weatherIcon.src = iconUrl;

        weatherIcon.alt =
            current.condition?.text ||
            "Biểu tượng thời tiết";

        weatherIcon.classList
            .remove("hidden");
    } else {
        weatherIcon.classList
            .add("hidden");
    }
}


/* =========================================================
   12. DỰ BÁO THEO GIỜ
   ========================================================= */

function renderHourlyForecast(
    forecastDays,
    location
) {
    const hourlyContainer =
        getElement("hourlyForecast");

    hourlyContainer.innerHTML = "";

    const allHours =
        forecastDays.flatMap(
            (forecastDay) =>
                Array.isArray(
                    forecastDay.hour
                )
                    ? forecastDay.hour
                    : []
        );

    const currentEpoch =
        Number(location.localtime_epoch) ||
        Math.floor(Date.now() / 1000);

    let upcomingHours =
        allHours
            .filter(
                (hour) =>
                    Number(hour.time_epoch) >=
                    currentEpoch - 1800
            )
            .slice(0, 24);

    if (upcomingHours.length === 0) {
        upcomingHours =
            allHours.slice(0, 24);
    }

    if (upcomingHours.length === 0) {
        hourlyContainer.innerHTML = `
            <div class="forecast-placeholder">
                Không có dữ liệu dự báo theo giờ.
            </div>
        `;

        return;
    }

    upcomingHours.forEach(
        (hour, index) => {
            const card =
                document.createElement(
                    "article"
                );

            card.className =
                index === 0
                    ? "hourly-card current-hour"
                    : "hourly-card";

            const timeText =
                extractTimeFromApi(
                    hour.time
                );

            const conditionText =
                hour.condition?.text ||
                "--";

            const iconUrl =
                normalizeWeatherIconUrl(
                    hour.condition?.icon
                );

            const rainChance =
                hour.chance_of_rain ?? 0;

            card.innerHTML = `
                <span class="hourly-time">
                    ${
                        index === 0
                            ? "Bây giờ"
                            : escapeHtml(timeText)
                    }
                </span>

                <img
                    class="hourly-icon"
                    src="${escapeHtml(iconUrl)}"
                    alt="${escapeHtml(conditionText)}"
                    loading="lazy"
                >

                <strong class="hourly-temperature">
                    ${Math.round(hour.temp_c)}°
                </strong>

                <span class="hourly-condition">
                    ${escapeHtml(conditionText)}
                </span>

                <span class="hourly-rain">
                    💧 ${rainChance}%
                </span>
            `;

            hourlyContainer
                .appendChild(card);
        }
    );
}


/* =========================================================
   13. DỰ BÁO NHIỀU NGÀY
   ========================================================= */

function renderDailyForecast(
    forecastDays
) {
    const dailyContainer =
        getElement("dailyForecast");

    dailyContainer.innerHTML = "";

    if (!forecastDays.length) {
        dailyContainer.innerHTML = `
            <div class="forecast-placeholder">
                Không có dữ liệu dự báo nhiều ngày.
            </div>
        `;

        return;
    }

    forecastDays.forEach(
        (forecastDay, index) => {
            const dayData =
                forecastDay.day || {};

            const condition =
                dayData.condition || {};

            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "daily-card";

            const date =
                parseForecastDate(
                    forecastDay.date
                );

            const dayName =
                index === 0
                    ? "Hôm nay"
                    : formatVietnameseWeekday(
                        date
                    );

            const dateText =
                formatShortDate(date);

            const iconUrl =
                normalizeWeatherIconUrl(
                    condition.icon
                );

            card.innerHTML = `
                <strong class="daily-day">
                    ${escapeHtml(dayName)}
                </strong>

                <span class="daily-date">
                    ${escapeHtml(dateText)}
                </span>

                <img
                    class="daily-icon"
                    src="${escapeHtml(iconUrl)}"
                    alt="${escapeHtml(
                        condition.text || ""
                    )}"
                    loading="lazy"
                >

                <span class="daily-condition">
                    ${escapeHtml(
                        condition.text || "--"
                    )}
                </span>

                <div class="daily-temperature">
                    <strong>
                        ${Math.round(
                            dayData.maxtemp_c
                        )}°
                    </strong>

                    <span>
                        ${Math.round(
                            dayData.mintemp_c
                        )}°
                    </span>
                </div>

                <span class="daily-rain">
                    💧 ${
                        dayData.daily_chance_of_rain
                        ?? 0
                    }%
                </span>
            `;

            dailyContainer
                .appendChild(card);
        }
    );
}


/* =========================================================
   14. CHẤT LƯỢNG KHÔNG KHÍ
   ========================================================= */

function renderAirQuality(
    airQuality
) {
    if (!airQuality) {
        resetAirQualityDisplay();
        return;
    }

    const epaIndex =
        Number(
            airQuality[
                "us-epa-index"
            ]
        ) || 0;

    const airStatus =
        getAirQualityStatus(
            epaIndex
        );

    setText(
        "airQualityValue",
        epaIndex > 0
            ? String(epaIndex)
            : "--"
    );

    setText(
        "airQualityStatus",
        airStatus.title
    );

    setText(
        "airQualityDescription",
        airStatus.description
    );

    setText(
        "pm25",
        formatPollutantValue(
            airQuality.pm2_5
        )
    );

    setText(
        "pm10",
        formatPollutantValue(
            airQuality.pm10
        )
    );

    setText(
        "carbonMonoxide",
        formatPollutantValue(
            airQuality.co
        )
    );

    setText(
        "nitrogenDioxide",
        formatPollutantValue(
            airQuality.no2
        )
    );

    const scoreElement =
        getElement(
            "airQualityValue"
        )?.parentElement;

    if (scoreElement) {
        scoreElement.style
            .borderColor =
            airStatus.color;

        scoreElement.style
            .background = `
                linear-gradient(
                    145deg,
                    ${airStatus.background},
                    rgba(14, 165, 233, 0.14)
                )
            `;
    }
}


function resetAirQualityDisplay() {
    setText(
        "airQualityValue",
        "--"
    );

    setText(
        "airQualityStatus",
        "Chưa xác định"
    );

    setText(
        "airQualityDescription",
        "Không có dữ liệu chất lượng không khí."
    );

    setText("pm25", "--");
    setText("pm10", "--");
    setText("carbonMonoxide", "--");
    setText("nitrogenDioxide", "--");
}


function getAirQualityStatus(
    index
) {
    const levels = {
        1: {
            title: "Tốt",
            description:
                "Chất lượng không khí tốt và ít gây ảnh hưởng đến sức khỏe.",
            color:
                "rgba(34, 197, 94, 0.65)",
            background:
                "rgba(34, 197, 94, 0.28)"
        },

        2: {
            title: "Trung bình",
            description:
                "Chất lượng không khí ở mức chấp nhận được.",
            color:
                "rgba(234, 179, 8, 0.65)",
            background:
                "rgba(234, 179, 8, 0.25)"
        },

        3: {
            title:
                "Không tốt cho nhóm nhạy cảm",
            description:
                "Trẻ em, người lớn tuổi và người có bệnh hô hấp nên hạn chế hoạt động ngoài trời.",
            color:
                "rgba(249, 115, 22, 0.7)",
            background:
                "rgba(249, 115, 22, 0.26)"
        },

        4: {
            title:
                "Không tốt",
            description:
                "Mọi người nên hạn chế hoạt động kéo dài ngoài trời.",
            color:
                "rgba(239, 68, 68, 0.7)",
            background:
                "rgba(239, 68, 68, 0.26)"
        },

        5: {
            title:
                "Rất không tốt",
            description:
                "Nên giảm tối đa các hoạt động ngoài trời.",
            color:
                "rgba(168, 85, 247, 0.7)",
            background:
                "rgba(168, 85, 247, 0.25)"
        },

        6: {
            title:
                "Nguy hại",
            description:
                "Chất lượng không khí nguy hại. Nên ở trong nhà và hạn chế tiếp xúc.",
            color:
                "rgba(127, 29, 29, 0.85)",
            background:
                "rgba(127, 29, 29, 0.38)"
        }
    };

    return (
        levels[index] || {
            title:
                "Chưa xác định",
            description:
                "Không có đủ dữ liệu để đánh giá chất lượng không khí.",
            color:
                "rgba(56, 189, 248, 0.4)",
            background:
                "rgba(56, 189, 248, 0.15)"
        }
    );
}


/* =========================================================
   15. ĐỊNH VỊ GPS
   ========================================================= */

function searchWeatherByCurrentLocation() {
    if (!navigator.geolocation) {
        showToast(
            "Trình duyệt không hỗ trợ định vị.",
            "error"
        );

        return;
    }

    const locationButton =
        getElement("locationBtn");

    locationButton.disabled = true;

    showToast(
        "Đang xác định vị trí của bạn...",
        "info"
    );

    navigator.geolocation
        .getCurrentPosition(
            async (position) => {
                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                await getWeather(
                    `${latitude},${longitude}`
                );

                locationButton.disabled =
                    false;
            },

            (error) => {
                console.error(
                    "Lỗi định vị:",
                    error
                );

                let message =
                    "Không thể xác định vị trí hiện tại.";

                if (error.code === 1) {
                    message =
                        "Bạn đã từ chối quyền truy cập vị trí.";
                }

                if (error.code === 2) {
                    message =
                        "Không thể xác định tọa độ hiện tại.";
                }

                if (error.code === 3) {
                    message =
                        "Quá thời gian chờ xác định vị trí.";
                }

                showToast(
                    message,
                    "error"
                );

                locationButton.disabled =
                    false;
            },

            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 300000
            }
        );
}


/* =========================================================
   16. THEO DÕI TRẠNG THÁI ĐĂNG NHẬP
   ========================================================= */

function initializeAuthenticationListener() {
    onAuthStateChanged(
        auth,
        async (user) => {
            currentUser =
                user || null;

            if (currentUser) {
                getElement(
                    "loggedOutView"
                ).classList.add(
                    "hidden"
                );

                getElement(
                    "loggedInView"
                ).classList.remove(
                    "hidden"
                );

                setText(
                    "userEmailDisplay",
                    currentUser.email ||
                    "Người dùng"
                );

                await Promise.allSettled([
                    loadSearchHistory(),
                    loadFavorites()
                ]);
            } else {
                getElement(
                    "loggedOutView"
                ).classList.remove(
                    "hidden"
                );

                getElement(
                    "loggedInView"
                ).classList.add(
                    "hidden"
                );

                renderLoggedOutLists();
                updateFavoriteButton(false);
            }
        }
    );
}


/* =========================================================
   17. MODAL ĐĂNG NHẬP
   ========================================================= */

function openAuthModal() {
    getElement("authModal")
        .classList.remove("hidden");

    getElement("authError")
        .classList.add("hidden");

    window.setTimeout(() => {
        getElement("emailInput")
            .focus();
    }, 100);
}


function closeAuthModal() {
    getElement("authModal")
        .classList.add("hidden");

    getElement("authError")
        .classList.add("hidden");
}


function switchAuthenticationMode(
    event
) {
    event.preventDefault();

    isLoginMode =
        !isLoginMode;

    setText(
        "authTitle",
        isLoginMode
            ? "Đăng nhập"
            : "Đăng ký tài khoản"
    );

    setText(
        "submitAuthBtn",
        isLoginMode
            ? "Đăng nhập"
            : "Tạo tài khoản"
    );

    setText(
        "authSwitchText",
        isLoginMode
            ? "Chưa có tài khoản?"
            : "Đã có tài khoản?"
    );

    setText(
        "switchAuthMode",
        isLoginMode
            ? "Đăng ký ngay"
            : "Đăng nhập ngay"
    );

    getElement("authError")
        .classList.add("hidden");
}


/* =========================================================
   18. ĐĂNG NHẬP VÀ ĐĂNG KÝ
   ========================================================= */

async function submitAuthentication() {
    const email =
        getElement("emailInput")
            .value.trim();

    const password =
        getElement("passwordInput")
            .value;

    const submitButton =
        getElement("submitAuthBtn");

    getElement("authError")
        .classList.add("hidden");

    if (
        !email ||
        !password
    ) {
        showAuthenticationError(
            "Vui lòng nhập đầy đủ email và mật khẩu."
        );

        return;
    }

    if (password.length < 6) {
        showAuthenticationError(
            "Mật khẩu phải có ít nhất 6 ký tự."
        );

        return;
    }

    submitButton.disabled = true;

    submitButton.textContent =
        isLoginMode
            ? "Đang đăng nhập..."
            : "Đang tạo tài khoản...";

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );
        } else {
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );
        }

        getElement(
            "passwordInput"
        ).value = "";

        closeAuthModal();

        showToast(
            isLoginMode
                ? "Đăng nhập thành công."
                : "Tạo tài khoản thành công.",
            "success"
        );
    } catch (error) {
        console.error(
            "Lỗi xác thực:",
            error
        );

        showAuthenticationError(
            translateFirebaseAuthError(
                error
            )
        );
    } finally {
        submitButton.disabled =
            false;

        submitButton.textContent =
            isLoginMode
                ? "Đăng nhập"
                : "Tạo tài khoản";
    }
}


/* =========================================================
   19. ĐĂNG XUẤT
   ========================================================= */

async function logoutCurrentUser() {
    try {
        await signOut(auth);

        showToast(
            "Đã đăng xuất tài khoản.",
            "success"
        );
    } catch (error) {
        console.error(
            "Lỗi đăng xuất:",
            error
        );

        showToast(
            "Không thể đăng xuất. Vui lòng thử lại.",
            "error"
        );
    }
}


function showAuthenticationError(
    message
) {
    const authError =
        getElement("authError");

    authError.textContent =
        message;

    authError.classList
        .remove("hidden");
}


function translateFirebaseAuthError(
    error
) {
    const messages = {
        "auth/email-already-in-use":
            "Địa chỉ email này đã được sử dụng.",

        "auth/invalid-email":
            "Địa chỉ email không hợp lệ.",

        "auth/weak-password":
            "Mật khẩu chưa đủ mạnh.",

        "auth/invalid-credential":
            "Email hoặc mật khẩu không chính xác.",

        "auth/user-not-found":
            "Không tìm thấy tài khoản.",

        "auth/wrong-password":
            "Mật khẩu không chính xác.",

        "auth/too-many-requests":
            "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",

        "auth/network-request-failed":
            "Lỗi kết nối mạng. Vui lòng kiểm tra lại Internet."
    };

    return (
        messages[error?.code] ||
        error?.message ||
        "Đã xảy ra lỗi xác thực."
    );
}


/* =========================================================
   20. LƯU LỊCH SỬ TÌM KIẾM
   ========================================================= */

async function saveToSearchHistory(
    location
) {
    if (!currentUser) {
        return;
    }

    const locationData = {
        cityName:
            location.name,

        region:
            location.region || "",

        country:
            location.country || "",

        latitude:
            Number(location.lat),

        longitude:
            Number(location.lon),

        searchQuery:
            `${location.lat},${location.lon}`,

        locationKey:
            createLocationKey({
                cityName:
                    location.name,

                region:
                    location.region,

                country:
                    location.country
            })
    };

    try {
        const historyQuery =
            query(
                collection(
                    db,
                    "search_history"
                ),

                where(
                    "userId",
                    "==",
                    currentUser.uid
                )
            );

        const snapshot =
            await getDocs(
                historyQuery
            );

        const duplicateDocs = [];

        snapshot.forEach(
            (historyDoc) => {
                const data =
                    historyDoc.data();

                const existingKey =
                    data.locationKey ||
                    createLocationKey(
                        data
                    );

                if (
                    existingKey ===
                    locationData.locationKey
                ) {
                    duplicateDocs.push(
                        historyDoc.id
                    );
                }
            }
        );

        await Promise.all(
            duplicateDocs.map(
                (documentId) =>
                    deleteDoc(
                        doc(
                            db,
                            "search_history",
                            documentId
                        )
                    )
            )
        );

        await addDoc(
            collection(
                db,
                "search_history"
            ),
            {
                userId:
                    currentUser.uid,

                ...locationData,

                timestamp:
                    serverTimestamp()
            }
        );

        await loadSearchHistory();
    } catch (error) {
        console.error(
            "Lỗi lưu lịch sử tìm kiếm:",
            error
        );
    }
}


/* =========================================================
   21. HIỂN THỊ LỊCH SỬ TÌM KIẾM
   ========================================================= */

async function loadSearchHistory() {
    const historyList =
        getElement("historyList");

    if (!currentUser) {
        historyList.innerHTML = `
            <li class="empty-list-message">
                Đăng nhập để đồng bộ lịch sử tìm kiếm.
            </li>
        `;

        return;
    }

    try {
        const historyQuery =
            query(
                collection(
                    db,
                    "search_history"
                ),

                where(
                    "userId",
                    "==",
                    currentUser.uid
                )
            );

        const snapshot =
            await getDocs(
                historyQuery
            );

        const historyRecords = [];

        snapshot.forEach(
            (historyDoc) => {
                historyRecords.push({
                    id: historyDoc.id,
                    ...historyDoc.data()
                });
            }
        );

        historyRecords.sort(
            (a, b) =>
                getTimestampValue(
                    b.timestamp
                ) -
                getTimestampValue(
                    a.timestamp
                )
        );

        const recentRecords =
            historyRecords.slice(
                0,
                6
            );

        historyList.innerHTML = "";

        if (
            recentRecords.length === 0
        ) {
            historyList.innerHTML = `
                <li class="empty-list-message">
                    Chưa có lịch sử tìm kiếm.
                </li>
            `;

            return;
        }

        recentRecords.forEach(
            (record) => {
                const item =
                    document.createElement(
                        "li"
                    );

                const displayName =
                    formatLocationDisplay(
                        record
                    );

                item.innerHTML = `
                    <span>
                        ${escapeHtml(displayName)}
                    </span>

                    <span aria-hidden="true">
                        ›
                    </span>
                `;

                item.addEventListener(
                    "click",
                    () => {
                        getElement(
                            "cityInput"
                        ).value =
                            record.cityName ||
                            "";

                        getWeather(
                            getLocationSearchQuery(
                                record
                            ),
                            {
                                saveHistory:
                                    true
                            }
                        );
                    }
                );

                historyList
                    .appendChild(item);
            }
        );
    } catch (error) {
        console.error(
            "Lỗi tải lịch sử tìm kiếm:",
            error
        );

        historyList.innerHTML = `
            <li class="empty-list-message">
                Không thể tải lịch sử tìm kiếm.
            </li>
        `;
    }
}


/* =========================================================
   22. THÊM HOẶC XÓA YÊU THÍCH
   ========================================================= */

async function toggleFavoriteCity() {
    if (!currentUser) {
        openAuthModal();

        showToast(
            "Vui lòng đăng nhập để lưu thành phố yêu thích.",
            "info"
        );

        return;
    }

    if (!currentLocationRecord) {
        showToast(
            "Hãy tìm kiếm một thành phố trước.",
            "info"
        );

        return;
    }

    const favoriteButton =
        getElement("favBtn");

    favoriteButton.disabled = true;

    try {
        const favoriteQuery =
            query(
                collection(
                    db,
                    "favorites"
                ),

                where(
                    "userId",
                    "==",
                    currentUser.uid
                )
            );

        const snapshot =
            await getDocs(
                favoriteQuery
            );

        const matchingDocs = [];

        snapshot.forEach(
            (favoriteDoc) => {
                const data =
                    favoriteDoc.data();

                const existingKey =
                    data.locationKey ||
                    createLocationKey(
                        data
                    );

                if (
                    existingKey ===
                    currentLocationRecord
                        .locationKey
                ) {
                    matchingDocs.push(
                        favoriteDoc.id
                    );
                }
            }
        );

        if (
            matchingDocs.length > 0
        ) {
            await Promise.all(
                matchingDocs.map(
                    (documentId) =>
                        deleteDoc(
                            doc(
                                db,
                                "favorites",
                                documentId
                            )
                        )
                )
            );

            updateFavoriteButton(
                false
            );

            showToast(
                "Đã xóa khỏi danh sách yêu thích.",
                "success"
            );
        } else {
            await addDoc(
                collection(
                    db,
                    "favorites"
                ),
                {
                    userId:
                        currentUser.uid,

                    ...currentLocationRecord,

                    addedAt:
                        serverTimestamp()
                }
            );

            updateFavoriteButton(
                true
            );

            showToast(
                "Đã thêm vào danh sách yêu thích.",
                "success"
            );
        }

        await loadFavorites();
    } catch (error) {
        console.error(
            "Lỗi xử lý thành phố yêu thích:",
            error
        );

        showToast(
            "Không thể cập nhật danh sách yêu thích.",
            "error"
        );
    } finally {
        favoriteButton.disabled =
            false;
    }
}


/* =========================================================
   23. HIỂN THỊ THÀNH PHỐ YÊU THÍCH
   ========================================================= */

async function loadFavorites() {
    const favoritesList =
        getElement("favoritesList");

    if (!currentUser) {
        favoritesList.innerHTML = `
            <li class="empty-list-message">
                Đăng nhập để lưu thành phố yêu thích.
            </li>
        `;

        updateFavoriteButton(
            false
        );

        return;
    }

    try {
        const favoriteQuery =
            query(
                collection(
                    db,
                    "favorites"
                ),

                where(
                    "userId",
                    "==",
                    currentUser.uid
                )
            );

        const snapshot =
            await getDocs(
                favoriteQuery
            );

        const favoriteRecords = [];

        snapshot.forEach(
            (favoriteDoc) => {
                favoriteRecords.push({
                    id:
                        favoriteDoc.id,

                    ...favoriteDoc.data()
                });
            }
        );

        favoriteRecords.sort(
            (a, b) =>
                getTimestampValue(
                    b.addedAt
                ) -
                getTimestampValue(
                    a.addedAt
                )
        );

        favoritesList.innerHTML = "";

        if (
            favoriteRecords.length === 0
        ) {
            favoritesList.innerHTML = `
                <li class="empty-list-message">
                    Chưa có thành phố yêu thích.
                </li>
            `;

            updateFavoriteButton(
                false
            );

            return;
        }

        let isCurrentCityFavorite =
            false;

        favoriteRecords.forEach(
            (record) => {
                const recordKey =
                    record.locationKey ||
                    createLocationKey(
                        record
                    );

                if (
                    currentLocationRecord &&
                    recordKey ===
                        currentLocationRecord
                            .locationKey
                ) {
                    isCurrentCityFavorite =
                        true;
                }

                const item =
                    document.createElement(
                        "li"
                    );

                const citySpan =
                    document.createElement(
                        "span"
                    );

                const deleteButton =
                    document.createElement(
                        "span"
                    );

                citySpan.textContent =
                    formatLocationDisplay(
                        record
                    );

                deleteButton.className =
                    "delete-item-btn";

                deleteButton.innerHTML =
                    "&times;";

                deleteButton.title =
                    "Xóa khỏi danh sách yêu thích";

                citySpan.addEventListener(
                    "click",
                    () => {
                        getElement(
                            "cityInput"
                        ).value =
                            record.cityName ||
                            "";

                        getWeather(
                            getLocationSearchQuery(
                                record
                            )
                        );
                    }
                );

                deleteButton
                    .addEventListener(
                        "click",
                        async (event) => {
                            event
                                .stopPropagation();

                            try {
                                await deleteDoc(
                                    doc(
                                        db,
                                        "favorites",
                                        record.id
                                    )
                                );

                                showToast(
                                    "Đã xóa thành phố yêu thích.",
                                    "success"
                                );

                                await loadFavorites();
                            } catch (error) {
                                console.error(
                                    "Lỗi xóa thành phố yêu thích:",
                                    error
                                );

                                showToast(
                                    "Không thể xóa thành phố yêu thích.",
                                    "error"
                                );
                            }
                        }
                    );

                item.append(
                    citySpan,
                    deleteButton
                );

                favoritesList
                    .appendChild(item);
            }
        );

        updateFavoriteButton(
            isCurrentCityFavorite
        );
    } catch (error) {
        console.error(
            "Lỗi tải danh sách yêu thích:",
            error
        );

        favoritesList.innerHTML = `
            <li class="empty-list-message">
                Không thể tải danh sách yêu thích.
            </li>
        `;
    }
}


/* =========================================================
   24. CẬP NHẬT NÚT YÊU THÍCH
   ========================================================= */

function updateFavoriteButton(
    isFavorite
) {
    const favoriteButton =
        getElement("favBtn");

    if (!favoriteButton) {
        return;
    }

    favoriteButton.textContent =
        isFavorite
            ? "❤"
            : "☆";

    favoriteButton.title =
        isFavorite
            ? "Xóa khỏi danh sách yêu thích"
            : "Thêm vào danh sách yêu thích";

    favoriteButton.setAttribute(
        "aria-label",
        favoriteButton.title
    );
}


function renderLoggedOutLists() {
    getElement(
        "favoritesList"
    ).innerHTML = `
        <li class="empty-list-message">
            Đăng nhập để lưu thành phố yêu thích.
        </li>
    `;

    getElement(
        "historyList"
    ).innerHTML = `
        <li class="empty-list-message">
            Đăng nhập để đồng bộ lịch sử tìm kiếm.
        </li>
    `;
}


/* =========================================================
   25. GẮN SỰ KIỆN GIAO DIỆN
   ========================================================= */

function bindInterfaceEvents() {
    getElement("searchBtn")
        .addEventListener(
            "click",
            searchWeatherByInput
        );

    getElement("cityInput")
        .addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Enter"
                ) {
                    event.preventDefault();
                    searchWeatherByInput();
                }
            }
        );

    getElement("locationBtn")
        .addEventListener(
            "click",
            searchWeatherByCurrentLocation
        );

    getElement("mapZoomInBtn")
        .addEventListener(
            "click",
            zoomMapIn
        );

    getElement("mapZoomOutBtn")
        .addEventListener(
            "click",
            zoomMapOut
        );

    getElement("mapResetBtn")
        .addEventListener(
            "click",
            resetMapView
        );

    getElement("favBtn")
        .addEventListener(
            "click",
            toggleFavoriteCity
        );

    getElement("hourlyPrevBtn")
        .addEventListener(
            "click",
            () => {
                getElement(
                    "hourlyForecast"
                ).scrollBy({
                    left: -420,
                    behavior: "smooth"
                });
            }
        );

    getElement("hourlyNextBtn")
        .addEventListener(
            "click",
            () => {
                getElement(
                    "hourlyForecast"
                ).scrollBy({
                    left: 420,
                    behavior: "smooth"
                });
            }
        );

    getElement("showAuthBtn")
        .addEventListener(
            "click",
            openAuthModal
        );

    getElement("closeAuthBtn")
        .addEventListener(
            "click",
            closeAuthModal
        );

    getElement("authModalBackdrop")
        .addEventListener(
            "click",
            closeAuthModal
        );

    getElement("switchAuthMode")
        .addEventListener(
            "click",
            switchAuthenticationMode
        );

    getElement("submitAuthBtn")
        .addEventListener(
            "click",
            submitAuthentication
        );

    getElement("logoutBtn")
        .addEventListener(
            "click",
            logoutCurrentUser
        );

    [
        "emailInput",
        "passwordInput"
    ].forEach(
        (inputId) => {
            getElement(inputId)
                .addEventListener(
                    "keydown",
                    (event) => {
                        if (
                            event.key ===
                            "Enter"
                        ) {
                            event.preventDefault();
                            submitAuthentication();
                        }
                    }
                );
        }
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Escape" &&
                !getElement(
                    "authModal"
                ).classList.contains(
                    "hidden"
                )
            ) {
                closeAuthModal();
            }
        }
    );

    window.addEventListener(
        "resize",
        () => {
            window.setTimeout(
                () =>
                    weatherMap?.invalidateSize(),
                100
            );
        }
    );
}


/* =========================================================
   26. TRẠNG THÁI ĐANG TẢI
   ========================================================= */

function setLoadingState(
    isLoading
) {
    getElement("loadingOverlay")
        .classList.toggle(
            "hidden",
            !isLoading
        );

    getElement("searchBtn")
        .disabled =
        isLoading;

    getElement("cityInput")
        .disabled =
        isLoading;
}


/* =========================================================
   27. THÔNG BÁO GIAO DIỆN
   ========================================================= */

function showValidationMessage(
    message
) {
    hideMessages();

    const element =
        getElement(
            "validationMessage"
        );

    element.textContent =
        message;

    element.classList
        .remove("hidden");
}


function showErrorMessage(
    message
) {
    hideMessages();

    const element =
        getElement(
            "errorMessage"
        );

    element.textContent =
        message;

    element.classList
        .remove("hidden");
}


function hideMessages() {
    getElement(
        "validationMessage"
    ).classList.add("hidden");

    getElement(
        "errorMessage"
    ).classList.add("hidden");
}


/* =========================================================
   28. THÔNG BÁO TOAST
   ========================================================= */

function showToast(
    message,
    type = "success"
) {
    const toast =
        getElement("toastMessage");

    const toastIcon =
        getElement("toastIcon");

    const toastText =
        getElement("toastText");

    const icons = {
        success: "✓",
        error: "!",
        info: "i"
    };

    toastIcon.textContent =
        icons[type] ||
        icons.success;

    toastText.textContent =
        message;

    toast.classList
        .remove("hidden");

    window.clearTimeout(
        toastTimer
    );

    toastTimer =
        window.setTimeout(
            () => {
                toast.classList
                    .add("hidden");
            },
            3500
        );
}


/* =========================================================
   29. HÀM GÁN NỘI DUNG
   ========================================================= */

function setText(
    id,
    value
) {
    const element =
        getElement(id);

    if (element) {
        element.textContent =
            value;
    }
}


/* =========================================================
   30. ĐỊNH DẠNG SỐ
   ========================================================= */

function formatNumber(
    value,
    digits = 0
) {
    const numberValue =
        Number(value);

    if (
        !Number.isFinite(
            numberValue
        )
    ) {
        return "--";
    }

    return numberValue
        .toLocaleString(
            "vi-VN",
            {
                minimumFractionDigits:
                    digits,

                maximumFractionDigits:
                    digits
            }
        );
}


function formatPollutantValue(
    value
) {
    const numberValue =
        Number(value);

    if (
        !Number.isFinite(
            numberValue
        )
    ) {
        return "--";
    }

    return `${formatNumber(
        numberValue,
        1
    )} µg/m³`;
}


/* =========================================================
   31. ĐÁNH GIÁ CHỈ SỐ UV
   ========================================================= */

function getUvStatus(
    uvValue
) {
    const uv =
        Number(uvValue);

    if (
        !Number.isFinite(uv)
    ) {
        return "Chưa có dữ liệu";
    }

    if (uv <= 2) {
        return "Thấp";
    }

    if (uv <= 5) {
        return "Trung bình";
    }

    if (uv <= 7) {
        return "Cao";
    }

    if (uv <= 10) {
        return "Rất cao";
    }

    return "Nguy hiểm";
}


/* =========================================================
   32. XỬ LÝ URL ICON
   ========================================================= */

function normalizeWeatherIconUrl(
    iconUrl
) {
    if (!iconUrl) {
        return "";
    }

    if (
        iconUrl.startsWith("//")
    ) {
        return `https:${iconUrl}`;
    }

    return iconUrl;
}


/* =========================================================
   33. XỬ LÝ NGÀY GIỜ
   ========================================================= */

function extractTimeFromApi(
    dateTimeText
) {
    if (!dateTimeText) {
        return "--:--";
    }

    const parts =
        String(dateTimeText)
            .split(" ");

    return (
        parts[1] ||
        "--:--"
    );
}


function parseForecastDate(
    dateText
) {
    if (!dateText) {
        return new Date();
    }

    return new Date(
        `${dateText}T00:00:00`
    );
}


function formatVietnameseWeekday(
    date
) {
    const weekdays = [
        "Chủ nhật",
        "Thứ hai",
        "Thứ ba",
        "Thứ tư",
        "Thứ năm",
        "Thứ sáu",
        "Thứ bảy"
    ];

    return (
        weekdays[
            date.getDay()
        ] ||
        "--"
    );
}


function formatShortDate(
    date
) {
    if (
        !(date instanceof Date) ||
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "--/--";
    }

    return date
        .toLocaleDateString(
            "vi-VN",
            {
                day: "2-digit",
                month: "2-digit"
            }
        );
}


/* =========================================================
   34. XỬ LÝ DỮ LIỆU ĐỊA ĐIỂM
   ========================================================= */

function createLocationKey(
    data
) {
    return [
        data.cityName,
        data.region,
        data.country
    ]
        .filter(Boolean)
        .map(
            (part) =>
                String(part)
                    .trim()
                    .toLowerCase()
        )
        .join("|");
}


function formatLocationDisplay(
    record
) {
    return [
        record.cityName,
        record.region,
        record.country
    ]
        .filter(Boolean)
        .join(", ");
}


function getLocationSearchQuery(
    record
) {
    if (record.searchQuery) {
        return record.searchQuery;
    }

    const latitude =
        Number(
            record.latitude
        );

    const longitude =
        Number(
            record.longitude
        );

    if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
    ) {
        return `${latitude},${longitude}`;
    }

    return (
        record.cityName ||
        ""
    );
}


/* =========================================================
   35. XỬ LÝ THỜI GIAN FIRESTORE
   ========================================================= */

function getTimestampValue(
    timestamp
) {
    if (!timestamp) {
        return 0;
    }

    if (
        typeof timestamp.toMillis ===
        "function"
    ) {
        return timestamp.toMillis();
    }

    if (
        Number.isFinite(
            timestamp.seconds
        )
    ) {
        return (
            timestamp.seconds *
            1000
        );
    }

    return 0;
}


/* =========================================================
   36. CHỐNG CHÈN MÃ HTML
   ========================================================= */

function escapeHtml(
    value
) {
    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* =========================================================
   37. CHẠY ỨNG DỤNG
   ========================================================= */

initializeAppInterface();