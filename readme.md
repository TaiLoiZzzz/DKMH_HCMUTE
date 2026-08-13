Auto-Kill ĐKMH HCMUTE - Enterprise Architecture
Hệ thống tự động hóa đăng ký môn học (Auto-Registration Bot) dành cho sinh viên trường Đại học Sư phạm Kỹ thuật TP.HCM (HCMUTE). Được thiết kế theo kiến trúc hướng sự kiện (Event-driven) và tối ưu hóa xử lý bất đồng bộ, công cụ này giúp tự động quét, phân tích và chiếm slot môn học trong vòng mili-giây.

 Kiến trúc & Tính năng cốt lõi (Core Features)
Man-in-the-Middle (MitM) Token Sniffing: Sử dụng Puppeteer để chặn bắt (intercept) các outbound HTTP request, tự động bóc tách JWT Token từ Header của giao diện Web mà không cần phải gọi lại API xác thực thủ công.

Stealth Engine (Anti-Bot Bypass): Tích hợp puppeteer-extra-plugin-stealth và giả mạo Fingerprint (User-Agent, WebGL) để vượt qua hệ thống reCAPTCHA v3 và các cơ chế phát hiện tự động hóa của Google/Trường.

Auto-Recovery (Self-Healing Session): Khi JWT Token hết hạn (401 Unauthorized), hệ thống tự động đánh thức trình duyệt ẩn, nạp lại Cookie cục bộ (Local Session) để xin cấp Token mới và tiếp tục chạy ngầm hoàn toàn tự động.

Random Jitter Polling: Tự động hóa độ trễ ngẫu nhiên (50s - 75s) giữa các lần gọi API, mô phỏng hành vi thao tác của người thật để vượt qua hệ thống tường lửa (WAF / Rate Limiting).

Pre-Check Validation: Cơ chế kiểm định chặt chẽ trước khi thực thi. Tự động kiểm tra điều kiện trùng thời khóa biểu (IsConflict) hoặc giới hạn tín chỉ trước khi gửi lệnh POST đăng ký, ngăn ngừa lỗi vòng lặp vô tận.

 Yêu cầu hệ thống (Prerequisites)
Đảm bảo máy tính của bạn đã cài đặt môi trường sau:

Node.js (Khuyến nghị bản LTS v18+)

Trình quản lý gói npm.
 Cài đặt (Installation)
Clone kho lưu trữ này về máy:

Bash
git clone https://github.com/your-username/auto-kill-dkmh.git
cd auto-kill-dkmh
Cài đặt các thư viện lõi (Dependencies):

Bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth axios readline
 Cấu hình (Configuration)
Trước khi chạy, bạn cần cập nhật các thông số cục bộ trong file auto_dkmh.js (Phần CẤU HÌNH LÕI HỆ THỐNG):

TURN_ID: Mã đợt đăng ký hiện tại (Ví dụ: 77). Bạn có thể lấy mã này bằng cách F12 (Network tab) trên trình duyệt khi bấm đăng ký một môn bất kỳ.

STUDY_PROGRAM_ID: Mã chương trình học của bạn (Ví dụ: 5 số đầu của MSSV).

 Hướng dẫn vận hành (Usage)
Khởi động công cụ thông qua Terminal:

Bash
node auto_dkmh.js
Nhập mã môn học hệ thống yêu cầu (Ví dụ: 261LLCT120205). Hệ thống sẽ khóa mục tiêu và bắt đầu quy trình tác chiến.

Ở lần chạy đầu tiên, trình duyệt sẽ mở lên yêu cầu đăng nhập Google. Từ các lần sau, hệ thống sẽ tự động dùng session đã lưu trên ổ cứng để hoạt động ngầm hoàn toàn.

Treo máy hoặc triển khai trên VPS. Khi đăng ký thành công, hệ thống sẽ phát âm báo động và tự động đóng tiến trình.

 Cảnh báo trách nhiệm (Disclaimer)
Dự án này được viết với mục đích nghiên cứu kiến trúc hệ thống mạng, API Interception và kỹ thuật tự động hóa (Educational Purposes Only).

Người dùng tự chịu mọi trách nhiệm về rủi ro tài khoản (nếu có) khi lạm dụng hệ thống hoặc vi phạm quy chế của nhà trường. Không khuyến khích thay đổi INTERVAL xuống mức quá thấp gây ảnh hưởng tới băng thông máy chủ chung.