# HCMUTE Course Registration Automation

Dự án này cung cấp một công cụ tự động hóa quy trình đăng ký môn học dành cho sinh viên trường Đại học Sư phạm Kỹ thuật TP.HCM (HCMUTE). Hệ thống được thiết kế dựa trên kiến trúc hướng sự kiện (Event-driven) và tối ưu hóa xử lý bất đồng bộ, giúp việc giám sát và đăng ký học phần diễn ra liên tục, tự động và ổn định.

## Kiến trúc & Tính năng cốt lõi

* **Token Interception (Đánh chặn Token):** Sử dụng Puppeteer để chặn bắt (intercept) các outbound HTTP request, tự động bóc tách JWT Token từ quá trình xác thực mà không cần can thiệp thủ công.
* **Anti-Bot Bypass:** Tích hợp `puppeteer-extra-plugin-stealth` để quản lý fingerprint của trình duyệt, vượt qua các cơ chế kiểm tra tự động.
* **Auto-Recovery (Tự động phục hồi):** Tự động phát hiện khi JWT Token hết hạn (lỗi 401 Unauthorized), khởi chạy lại tiến trình xác thực ngầm để lấy Token mới và tiếp tục phiên làm việc mà không làm gián đoạn hệ thống.
* **Jitter Polling:** Áp dụng độ trễ ngẫu nhiên (từ 240s đến 360s) giữa các chu kỳ kiểm tra để giảm tải cho máy chủ trường và tránh bị hệ thống tường lửa (Rate Limiting) chặn kết nối.
* **Pre-Check Validation:** Tự động kiểm tra trước các điều kiện đăng ký (trùng thời khóa biểu, lớp đã đầy) trước khi gửi yêu cầu đăng ký chính thức, đảm bảo tính hợp lệ của request.

## Yêu cầu hệ thống

* Node.js (Khuyến nghị phiên bản LTS v18 trở lên).
* Trình quản lý gói npm (đi kèm với Node.js).
* Google Chrome hoặc Chromium.

## Cài đặt

1. Clone kho lưu trữ này về máy:
   ```bash
   git clone https://github.com/TaiLoiZzzz/DKMH_HCMUTE.git
   cd DKMH_HCMUTE
   ```

2. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```
   *(Các thư viện chính bao gồm: `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `axios`, `dotenv`)*

## Cấu hình

Tạo một file `.env` tại thư mục gốc của dự án và điền các thông số sau:

```env
API_KEY=
CLIENT_ID=
TURN_ID=
STUDY_PROGRAM_ID=
```

* `TURN_ID`: Mã đợt đăng ký hiện tại (có thể lấy bằng cách kiểm tra tab Network trên trình duyệt khi thực hiện thao tác trên trang đăng ký).
* `STUDY_PROGRAM_ID`: Mã chương trình học của bạn (thường là 5 chữ số đầu của mã số sinh viên).
* `API_KEY` và `CLIENT_ID`: Lấy từ header của request khi trường gọi API.

## Hướng dẫn sử dụng

1. Khởi chạy công cụ thông qua Terminal:
   ```bash
   node app.js
   ```

2. Nhập mã môn học hệ thống yêu cầu (Ví dụ: `120205` cho mã môn `261120205`). Hệ thống sẽ tự động ghép tiền tố và bắt đầu quá trình giám sát.

3. **Lưu ý trong quá trình chạy:**
   * Ở lần chạy đầu tiên, hệ thống sẽ mở một cửa sổ trình duyệt. Trình duyệt sẽ tự động cố gắng nhấn nút đăng nhập và chọn tài khoản Google của bạn (nếu đã lưu session).
   * Sau khi đăng nhập thành công, dữ liệu phiên làm việc sẽ được lưu cục bộ trong thư mục `chrome_profile_dkmh`. Từ các lần sau, hệ thống sẽ tận dụng session này để hoạt động hoàn toàn tự động.
   * Khi phát hiện có vị trí trống và thỏa mãn các điều kiện, hệ thống sẽ tiến hành gửi yêu cầu đăng ký, phát âm báo động (beep) và tự động kết thúc tiến trình.

## Khước từ trách nhiệm (Disclaimer)

Dự án này được phát triển hoàn toàn vì mục đích học tập và nghiên cứu (Educational Purposes Only), tập trung vào việc tìm hiểu kiến trúc mạng, xử lý API và kỹ thuật tự động hóa trình duyệt.

Người dùng tự chịu toàn bộ trách nhiệm về mọi rủi ro liên quan đến tài khoản cá nhân hoặc các vi phạm quy chế của nhà trường khi sử dụng công cụ này. Chúng tôi tuyệt đối không khuyến khích việc chỉnh sửa thời gian chờ (Polling Interval) xuống mức quá thấp, nhằm tránh gây ảnh hưởng tiêu cực đến hiệu suất và băng thông của hệ thống máy chủ chung.