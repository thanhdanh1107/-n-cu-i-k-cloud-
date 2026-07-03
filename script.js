const API_KEY = '744a01ba17c7496ca4d41519260307'; 

async function getWeather() {
    const cityInput = document.getElementById('cityInput');
    const weatherResult = document.getElementById('weatherResult');
    const validationMessage = document.getElementById('validationMessage');
    const errorMessage = document.getElementById('errorMessage');

    // Loại bỏ khoảng trắng thừa ở hai đầu text nhập vào
    const city = cityInput.value.trim();

    // Reset ẩn toàn bộ thông báo lỗi cũ
    validationMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');

    // --- BẮT VALIDATION ---
    // 1. Chặn trường hợp bỏ trống hoặc chỉ gõ dấu cách
    if (!city) {
        validationMessage.innerText = "Vui lòng nhập tên thành phố!";
        validationMessage.classList.remove('hidden');
        weatherResult.classList.add('hidden');
        return;
    }

    // 2. Chặn nhập số hoặc ký tự đặc biệt lạ (Tên thành phố chỉ chứa chữ cái và dấu cách)
    const cityRegex = /^[^0-9`~!@#$%^&*()_+\-=\[\]{};':",./<>?|\\\n]+$/;
    if (!cityRegex.test(city)) {
        validationMessage.innerText = "Tên thành phố không chứa chữ số hoặc ký tự đặc biệt!";
        validationMessage.classList.remove('hidden');
        weatherResult.classList.add('hidden');
        return;
    }

    // --- KHẮC PHỤC LỖI NHẢY SAI THÀNH PHỐ ---
    // Mã hóa an toàn chuỗi tiếng Việt và khoảng trắng (Ví dụ: "Đà Nẵng" -> "%C4%90%C3%A0%20N%E1%BA%B5ng")
    const encodedCity = encodeURIComponent(city);
    const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodedCity}&lang=vi`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            weatherResult.classList.remove('hidden');

            // Cập nhật tên và bổ sung thêm Bang/Quốc gia để người dùng đối chiếu chính xác vị trí địa lý
            document.getElementById('cityName').innerText = data.location.name;
            document.getElementById('countryName').innerText = `${data.location.region ? data.location.region + ', ' : ''}${data.location.country}`;
            
            document.getElementById('temperature').innerText = `${Math.round(data.current.temp_c)}°C`;
            document.getElementById('description').innerText = data.current.condition.text;
            document.getElementById('humidity').innerText = `${data.current.humidity}%`;
            document.getElementById('wind').innerText = `${data.current.wind_kph} km/h`;

            // Lấy ảnh icon thời tiết tương ứng từ API và hiển thị
            const weatherIcon = document.getElementById('weatherIcon');
            weatherIcon.src = "https:" + data.current.condition.icon;
            weatherIcon.classList.remove('hidden');
        } else {
            // Lỗi từ API khi không tìm ra thành phố phù hợp
            weatherResult.classList.add('hidden');
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Lỗi mạng: ", error);
        alert("Đã xảy ra lỗi kết nối với máy chủ thời tiết.");
    }
}

// Bổ sung tính năng trải nghiệm: Nhấn nút Enter trên bàn phím để tìm kiếm luôn
document.getElementById('cityInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        getWeather();
    }
});