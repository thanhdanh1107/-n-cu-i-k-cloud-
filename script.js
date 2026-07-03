// Gắn API Key của WeatherAPI.com bạn vừa cung cấp
const API_KEY = '744a01ba17c7496ca4d41519260307'; 

async function getWeather() {
    const city = document.getElementById('cityInput').value;
    const weatherResult = document.getElementById('weatherResult');
    const errorMessage = document.getElementById('errorMessage');

    // Nếu người dùng không nhập gì thì dừng lại
    if (!city) return;

    // Đường dẫn của WeatherAPI (thêm lang=vi để lấy tiếng Việt)
    const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}&lang=vi`;

    try {
        // Gửi yêu cầu lấy dữ liệu (Fetch API)
        const response = await fetch(url);
        const data = await response.json();

        // WeatherAPI trả về HTTP status 200 (ok) nếu tìm thấy thành phố
        if (response.ok) {
            // Ẩn thông báo lỗi, hiện kết quả
            errorMessage.classList.add('hidden');
            weatherResult.classList.remove('hidden');

            // Bóc tách và cập nhật dữ liệu từ WeatherAPI lên giao diện HTML
            document.getElementById('cityName').innerText = data.location.name;
            document.getElementById('temperature').innerText = `${Math.round(data.current.temp_c)}°C`;
            document.getElementById('description').innerText = data.current.condition.text;
            document.getElementById('humidity').innerText = `${data.current.humidity}%`;
            
            // Lưu ý: WeatherAPI trả về tốc độ gió theo km/h (kph) thay vì m/s
            document.getElementById('wind').innerText = `${data.current.wind_kph} km/h`;
        } else {
            // Lỗi (vd: nhập sai tên thành phố)
            weatherResult.classList.add('hidden');
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Lỗi khi gọi API: ", error);
        alert("Đã xảy ra lỗi kết nối mạng hoặc máy chủ, vui lòng thử lại sau.");
    }
}