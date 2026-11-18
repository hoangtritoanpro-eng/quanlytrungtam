# Quản lý Trung tâm Nắng Mai

Ứng dụng web quản lý trung tâm dạy thêm: lớp học, học sinh, điểm danh, điểm số, học phí, thời khóa biểu và tài khoản giáo viên.

- **Giao diện:** React 18 + Vite, triển khai trên Vercel (`quanlytrungtamnangmai.vercel.app`).
- **Dữ liệu:** Google Sheet. Truy cập qua Google Apps Script (`code.gs`) triển khai dạng Ứng dụng web.
- **Chạy không cần Google:** nếu chưa đặt `VITE_GAS_URL`, web tự lưu dữ liệu trong trình duyệt (localStorage). Chế độ này chỉ dùng để thử.

## Chức năng chính

| Trang | Vai trò | Nội dung |
|---|---|---|
| Dashboard | ADMIN | Ca học hôm nay và trạng thái điểm danh, học sinh vắng liên tiếp, học phí tháng |
| Lịch học | Tất cả (`/lich-hoc` công khai) | Thời khóa biểu, cơ sở, hồ sơ giáo viên; gắn ca với lớp; cảnh báo trùng giờ |
| Lớp học / Học sinh | ADMIN (giáo viên xem lớp của mình) | Ghi danh, phân công giáo viên |
| Điểm danh | Tất cả | Gợi ý ca trong ngày, chạm tên để đổi vắng/có mặt, báo vắng phụ huynh, xuất Excel tháng |
| Điểm số | ADMIN, giáo viên | Nhập điểm theo bài, xuất bảng điểm Excel |
| Học phí | ADMIN, giáo viên (chỉ ADMIN thu tiền) | Theo tháng, đánh dấu đã đóng, in phiếu thu, nhắc phụ huynh, xuất Excel |
| Báo cáo phụ huynh | Công khai qua link `/parent/<mã học sinh>` | Điểm danh, điểm, học phí của một học sinh |

Nhấn **Ctrl+K** (hoặc nút 🔍) ở bất kỳ trang nào để tìm nhanh học sinh, lớp hoặc trang.

## Chạy trên máy

```bash
npm install
npm run dev
```

Mặc định web chạy bằng localStorage. Có hai cách nối với Apps Script:

- **Nối với Google Sheet thật:** tạo file `.env.local` với một dòng `VITE_GAS_URL=https://script.google.com/macros/s/.../exec`.
- **Dùng Apps Script giả lập, không đụng dữ liệu thật:** chạy hai lệnh ở hai cửa sổ, rồi đăng nhập `admin@example.com` / PIN `1234`.

  ```bash
  npm run mock-gas
  ```

  ```bash
  VITE_GAS_URL=http://localhost:4300 npm run dev
  ```

## Kiểm thử

```bash
npm test
```

Lệnh này chạy `code.gs` trong Node với một Google Sheets giả lập ([tests/gas-mock.cjs](tests/gas-mock.cjs)). Nên chạy mỗi lần sửa `code.gs`.

## Triển khai

### 1. Apps Script (máy chủ dữ liệu)

1. Mở Google Sheet → **Tiện ích mở rộng → Apps Script**.
2. Dán toàn bộ nội dung [code.gs](code.gs), lưu (Ctrl+S).
3. Lần đầu: chọn hàm `setupSheets` → **Chạy** để tạo đủ các sheet và cột.
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**, chọn *Thực thi bằng tư cách: Tôi* và *Người có quyền truy cập: Bất kỳ ai*, rồi sao chép URL `/exec`.

**Mỗi lần sửa `code.gs`:** dán mã mới, lưu, rồi vào **Triển khai → Quản lý các tùy chọn triển khai** → bút chì → *Phiên bản: Phiên bản mới* → **Triển khai**. Làm theo cách này thì URL giữ nguyên. Nếu chọn "Tùy chọn triển khai mới", URL sẽ đổi và web sẽ vẫn gọi bản cũ.

> Cập nhật Apps Script **trước**, rồi mới push frontend. Nếu làm ngược lại, các chức năng mới sẽ báo "Action không hợp lệ" cho tới khi Apps Script được cập nhật.

### 2. Vercel (giao diện)

Project Vercel: **quanlytrungtamnangmai**. Lưu ý project `quanlytrungtam` là project khác, không phục vụ tên miền này.

1. **Settings → Environment Variables**: thêm `VITE_GAS_URL` = URL `/exec` ở trên.
2. Mỗi lần push lên nhánh `main`, Vercel tự build lại. Sau khi đổi biến môi trường thì phải **Redeploy**.

## Cấu trúc Google Sheet

Mỗi sheet có dòng tiêu đề ở dòng 1. `code.gs` đọc và ghi theo **tên cột**, nên có thể đổi thứ tự cột; cột còn thiếu sẽ tự được thêm.

| Sheet | Cột |
|---|---|
| Users | Email, Name, Role (`ADMIN`/`TEACHER`/`TA`), Pin, Active (`TRUE`/`FALSE`) |
| Classes | ClassID, ClassName, Subject, Grade, FeePerSession, StartDate, Status |
| Students | StudentID, FullName, SchoolClass, ParentName, ParentPhone, ParentEmail, Note, Status |
| Enrollments | StudentID, ClassID, EnrollDate, Status (`ACTIVE`/`REMOVED`) |
| TeacherClasses | TeacherEmail, ClassID |
| Attendance | Date (`yyyy-MM-dd`), ClassID, StudentID, Present, Note, By |
| Scores | Date, ClassID, ExamName, MaxScore, StudentID, Score, Note, By |
| Payments | Month (`yyyy-MM`), ClassID, StudentID, Amount, PaidDate, Method, Note, By |
| ScheduleSlots | id, classId, day (2–7, 8 = Chủ nhật), startMin, endMin, time, className, teacher, room... |
| ScheduleSites | id, name, address, phone, mapUrl, note |
| ScheduleTeachers | name, role, subjects, qualification, experience, photo, phone, email, bio |

**Học phí** = số buổi có mặt trong tháng × `FeePerSession` của lớp. Mỗi dòng trong Payments ghi nhận một học sinh đã đóng học phí một lớp trong một tháng.

**Sao lưu:** trong Google Sheet chọn *Tệp → Tạo bản sao* hoặc *Tệp → Tải xuống → Excel*. Google Sheet cũng tự giữ lịch sử tại *Tệp → Nhật ký phiên bản*.

## Giới hạn đã biết

- **Đăng nhập:** chỉ dùng email + PIN, chưa có mã phiên. Máy chủ tin email do trình duyệt gửi lên.
- **Link báo cáo phụ huynh:** dùng mã học sinh tăng dần (STU001...), nên có thể đoán được.
- **Lưu thời khóa biểu:** mỗi lần lưu ghi lại cả bảng. Hai admin cùng sửa một lúc thì người lưu sau thắng.
- **Tốc độ:** mỗi lần gọi Apps Script mất khoảng 1–3 giây. Web đã giữ tạm danh sách lớp, học sinh và giáo viên trong 60 giây để chuyển trang nhanh hơn.
