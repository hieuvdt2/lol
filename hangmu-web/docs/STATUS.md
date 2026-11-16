# Tổng hợp tiến độ hangmu-web

Cập nhật cuối phiên làm vật lý nhân vật. Nguồn so sánh: bundle gốc (`hangmu-site/assets/index-*.js`) và hai ảnh chụp giao diện hang do người dùng cung cấp.
**Giới hạn:** chunk `CaveScreen`, `duel`, `duelMusic` và CSS của hang **không có trong capture**, nên phần giao diện/cảnh 3D trong hang của bản gốc chỉ so được qua ảnh chụp.

Kiểm tra hiện tại: 300 test đơn vị/server/client (chạy riêng từng file), 54 e2e (Chrome headless, 3 cỡ điện thoại + máy tính), build và typecheck sạch, lint còn 2 cảnh báo cũ.

Quy ước: ✅ xong · ◐ một phần · ❌ chưa làm · ⛔ đã quyết định bỏ · 🅼 do tôi tự thêm, **không có bằng chứng** từ bản gốc.

## 1. Có bằng chứng từ bản gốc

### Giao thức và server
| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Nhị phân MOVE/PING/WELCOME/MOVES/CORRECTION/PONG, tick 30 Hz | ✅ | mọi `case` của bộ xử lý tin nhắn gốc đều có trong `net.ts` |
| JSON: enter, chat (+ack/dropped), punch (+punchHit/punched), invite*, talk*, dm, game{duel,rage}, engaged, notice, poll, board, sys, queued, admitted, rejected, replaced | ✅ | |
| Hàng chờ, giữ chỗ 30 s khi rớt mạng, tab khác thì đá tab cũ | ✅ | |
| `/api/room/status`, `/api/me` (cookie `hm_sid`, 14 ngày), `/api/quiz` + `/api/quiz/answer` | ✅ | nội dung 14 câu quiz do tôi viết (bản gốc không có trong capture) |
| `/ext/espn/*` (proxy tỷ số bóng đá) | ❌ đã gỡ 2026-11-12 | thay bằng nội dung esport, xem mục 2b |
| Bảng "Võ công cao nhất hang" theo tuần, top 8 | ✅ | |
| Lọc từ thô tục, che link/SĐT trong chat riêng | ◐ | cơ chế có; [Unverified] danh sách từ của bản gốc (không có trong capture) |
| Chat giọng "Hội trường đá", báo cáo/mời ra bằng bỏ phiếu 40% | ⛔ | bạn đã chọn bỏ qua; có thể làm nếu bạn đổi ý |

### Trò chơi
| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Đấm (tầm 1,8, hình nón, thời gian hồi 1,65 s) | ✅ | viết lại phiên này theo hàm chọn mục tiêu của bản gốc |
| Giao lưu mồm (chat riêng 2 người) | ✅ | |
| Giao lưu võ thuật (duel 30 s, máu 100, đỡ/đấm, bảng xếp hạng) | ✅ | cảnh sàn đấu 3D tôi tự dựng; chưa đối chiếu được với chunk `duel` |
| Ném đồ 5 hình nộm, 4 loại đồ, 16 biệt danh | ✅ | |
| Bình chọn (poll), màn hình hội trường (video/nhạc) | ✅ | video chỉ mở ở khung 2D vì là iframe YouTube |
| Ngồi ghế hội trường (E) | ✅ | 50 ghế đúng bố cục gốc |
| Kéo co 2v2 (sân bên trái hang, nhấn E) | ❌ | chỉ thấy trên ảnh, chưa có luật/giao thức |
| "Ôm bóng không buông" (mục điểm) | ❌ | như trên |
| Ba mục còn lại của bảng phong thần (Cầu thủ mõm, Chân tay đỡ đầu óc, Ôm bóng) | ❌ | phụ thuộc hai trò trên |

### Di chuyển và vật lý (phiên này)
| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Tăng tốc, tốc độ 8, quay mặt theo hướng đi, bước nhỏ chống xuyên | ✅ | |
| Bán kính người chơi 0,32; vòng đi bộ 55,2 (đã mở rộng để leo khán đài; bản gốc 42); bục thi đấu giữa sân (11,5 + bán kính người; **thay đống lửa 2,65 của bản gốc theo yêu cầu đổi chủ đề**) | ✅ | trước đây thiếu bán kính người |
| Va chạm sân khấu hội trường và 50 ghế hội trường; **bỏ 154 ghế bậc thang và hố lửa của bản gốc** (khán giả giờ ngồi ở rìa, ngoài vòng đi bộ) | ✅ | trước đây không có va chạm ghế, ghế vẽ ở chỗ sai |
| Một mã vật lý duy nhất cho client và server (`shared/world.mjs`); bot đi bằng đúng mã đó | ✅ | |
| Ngồi: dịch lên ghế, mặt về màn hình, đứng dậy ở hành lang trước ghế; mỗi ghế một người | ✅ | cách xử lý chi tiết khi ngồi/đứng là suy luận của tôi |
| Gợi ý vùng "Hội trường đá: bấm E để ngồi" | ✅ | khung `zones.ts` hiện chỉ có đúng một vùng |
| Người khác nhìn thấy mình đang ngồi | ✅ | server giữ trạng thái ngồi (ghế trống, đủ gần), báo cả hang và người mới vào; buộc đứng dậy khi chat riêng/đấu võ; nối lại thì đứng dậy. 🅼 giao thức `sit`/`stand`/`seat`/`seats`/`seatDenied` do tôi tự đặt |
| Server kiểm tra va chạm cho người thật | ✅ | vị trí báo lên bị chạy qua cùng hàm va chạm của client; lệch quá 0,2 m (đi xuyên ghế/lửa/hình nộm) thì bị sửa |
| Nhân vật: mặt quay đúng về phía trước của thân; đầu xoay quanh cổ | ✅ | lỗi cũ: mặt quay ngang 90°, đầu và tóc xoay riêng và văng khỏi thân khi bị đấm |

### Giao diện và cảnh
| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Màn hình tỷ số treo hang | ✅ → đã đổi thành bảng xếp hạng LCK | xem mục 2b |
| Cờ tam giác trên trần | ✅ | |
| Bố cục HUD theo ảnh (nút trên-trái, "Hang chung", chat phải + Hoạt động, bảng phong thần trái, Ủng hộ/©/Phím) | ✅ | |
| Ăn mừng [G] | ✅ | tin nhắn `emote` do tôi tự đặt (🅼 phần giao thức) |
| Toast thông báo (vào hang, Telegram, kết quả võ thuật) | ✅ | |
| Âm lượng 0–100, tắt tiếng; tiếng khán đài reo (`cheer`, hiện chưa nơi nào gọi) | ✅ | |
| Màn ăn mừng bàn thắng của MU | ❌ đã gỡ 2026-11-12 | |
| Sảnh, quiz, đổi tên, cookie, điều khoản, ủng hộ, cài PWA, banner bản mới | ✅ | QR ủng hộ vẫn là **QR và tài khoản của bản gốc** — cần bạn thay |
| Nhân vật: mô hình, trang phục | ◐ | tự vẽ; chưa so được với bản gốc |
| Hang: họa tiết đá, rêu, dây leo, áo treo | ◐ | thô hơn ảnh gốc |
| Bảng tin ở hội trường, màn hình video lớn dạng 3D, sân cỏ kéo co | ❌ | |

## 2. Do tôi tự thêm (không có bằng chứng từ bản gốc)

Danh sách này để bạn quyết định giữ hay bỏ.
| Hạng mục | Lý do có | Gợi ý |
|---|---|---|
| Hệ thống hoạt hình thân người (`gait.ts`): đi theo quãng đường, đấm có chuẩn bị, bị đấm, ngồi, ăn mừng | bạn nói hoạt hình chưa mượt | giữ |
| Đấm chi tiết (phím F): **đấm trúng** (chuẩn bị, ra đòn, giữ, tay trái che mặt, thân xoay về phía mục tiêu), **đấm hụt** (vung quá đà 0,6 s, mất thăng bằng), **bị đấm** (phản ứng theo hướng đòn: từ trước ngả ra sau/bật lùi, từ sau chúi tới, từ bên bị hất sang bên đối diện; camera rung 0,42 s + viền đỏ 0,55 s; cả người xô tới/bị hất lùi, tia sáng khi trúng, vệt gió khi hụt, camera xô nhẹ theo cú đấm vì camera đứng sau lưng nên tay duỗi thẳng bị che) | bạn yêu cầu | giữ; **hình dạng hoạt hình, rung camera, viền đỏ, tiếng vung là tự thiết kế** — chunk `CaveScreen` không có trong capture. Bằng chứng từ bản gốc chỉ gồm: thời gian hồi 1,65 s áp cho cả hoạt hình, chọn mục tiêu bằng hình nón, đấm hụt không gửi gì lên server, tiếng "thịch" khi trúng/bị trúng |
| Tin nhắn `swing` (đấm hụt gửi lên; đòn trúng server tự phát) để người khác cũng thấy cú vung và người bị đấm phản ứng | bản gốc không báo đấm hụt cho ai nên người xem không thấy gì | giữ, ghi rõ là tự đặt |
| Tin nhắn `emote` + hoạt hình ăn mừng | ảnh có nút "Ăn mừng [G]" nhưng không có giao thức | giữ, ghi rõ là tự đặt |
| Lọc vùng quan tâm theo khoảng cách (gần 10 Hz, giữa 3,3 Hz, xa 1 Hz) | giảm băng thông ở 500 người | giữ, nhưng có thể làm người ở xa trông kém mượt |
| Ảnh thay thế (impostor) cho người ở xa, LOD theo camera | hiệu năng 400 người trên điện thoại | giữ |
| Nút "🥋 Võ công" + bảng `RankPanel`, nút ▾ + `VolumePanel` (cho điện thoại), chip LCK `LckWidget` ở cột phải | tôi dựng trước khi có ảnh gốc | chip tỷ số và `RankPanel` nay trùng với màn hình treo và bảng phong thần: nên cân nhắc bỏ |
| API quản trị `/admin/*`, lưu `state.json`, Docker/Caddy/systemd, `/healthz`, tắt êm, log JSON | vận hành | giữ |
| Giới hạn tần suất, kiểm tra Origin, chặn IP, bảo vệ khung WebSocket | bảo mật | giữ |
| Sàn đấu 3D (`arena.ts`), vòng ném đồ 3D (`rageRing.ts`) | bản gốc chắc chắn có nhưng mã không có trong capture | giữ, tự dựng |
| Bộ test, bộ đo hiệu năng (`perf:*`), `npm run lan`, `npm run crowd` | chất lượng | giữ |
| Các giá trị tôi đặt: vị trí ngồi/đứng dậy, bán kính tầm ghế 1,6, thời gian hồi ăn mừng 2,5 s | không có bằng chứng | điều chỉnh khi có tham chiếu |

## 2b. Đổi chủ đề sang fan T1 ("Hang Tê Đỏ") — theo yêu cầu của bạn

Đã làm: cảnh trong hang thành đấu trường esports (khán đài tối, vòng LED đỏ, giàn đèn trên trần, bục thi đấu giữa hang thay đống lửa, banner "TÊ ĐỎ", khung chân dung đeo tai nghe với mã vị trí MID/JUG/TOP/ADC/SUP), cảnh sảnh (cổng đấu trường ban đêm), đồng phục đen-đỏ-trắng, bảng màu giao diện (vàng đồng → bạc/trắng), tên "Hang Tê Đỏ" ở sảnh, tiêu đề trang, manifest, điều khoản, hộp thoại cài app, banner cookie, lời nhắn quiz, biểu tượng + favicon + ảnh OG (vẽ lại bằng lục giác đỏ + tia chớp, **không dùng logo T1**). Hình học (ghế, bục, tường) giữ nguyên vì vật lý server dùng chung.

**Đấu trường chung kết (`src/game/venue.ts`)** — làm theo ảnh tham khảo của bạn (bố cục chung, không sao chép logo/tên/tài trợ thật): khán giả ngồi kín khán đài (hàng trăm người, một phần giơ gậy sáng lắc theo nhịp), màn hình LED cong khổng lồ phía hội trường có hình động (sơ đồ trận cách điệu, thanh điểm số + đồng hồ, bảng đội hình đổi mỗi 8 s), dải LED chân dung 10 tuyển thủ dưới màn hình, giàn thanh đèn xiên chạy sáng trên trần, chùm đèn quét sân, cúp trên bục giữa sân, dải LED chữ chạy quanh vách, hình nộm thành tuyển thủ đeo tai nghe. Chữ và số liệu trên màn hình là **giả lập tự đặt** (không phải trận thật).
- Không đổi vật lý: bục giữa sân vẫn chiếm vùng chặn của đống lửa cũ; ghế khán đài vẫn là hộp chặn cũ; chân màn hình đặt đúng hộp chặn của sân khấu. Không có bàn máy/ghế gaming thật vì chưa có hộp chặn tương ứng.
- Chi phí: WebGL phần mềm (headless) chậm khoảng 30% khi bật đầy đủ. Điện thoại (con trỏ thô) chỉ hiện 45% số khán giả. `localStorage hangmu.lite = '1'` tắt khán giả, chùm đèn và nội dung động; bộ e2e dùng chế độ này mặc định (trừ `tests/e2e/venue.test.mjs`).
- Chưa đo FPS trên thiết bị thật. Ngưỡng geometry của bài `crowd` nâng từ 60 lên 95 vì cảnh cố định nay có ~74 geometry (không tăng theo số người).

**Làm lại giao diện cảnh theo góp ý "tối quá, đau mắt, vẫn giống bản cũ":**
- Bảng màu mới sáng và dịu: nền xám nhạt/trắng, than chì làm điểm nhấn, đỏ dịu `#d93a4a` chỉ điểm xuyết (không còn đỏ neon trên nền đen). Đèn trần/LED dùng trắng ấm.
- Nhận diện riêng thay vì "hang": mô-típ lục giác (tấm ốp trần, sàn, ghế, cổng sảnh), sàn có vòng đỏ/trắng và dải chữ "CHUNG KẾT / TÊ ĐỎ" đọc được từ ngoài nhìn vào, ghế khán đài xếp khảm đỏ-trắng-than chì, biển khu A–D ở bốn lối đi, gân vòm toả ra từ đỉnh với hai quầng sáng, tường chân vòm ốp tấm đứng + biển "HANG TÊ ĐỎ" trên cửa vào, bóng mờ dưới chân nhân vật. Sảnh ngoài giờ là cổng đấu trường ban ngày (trụ trắng viền đỏ, khán đài hai bên, cột đèn pha), không còn là cửa hang đá.
- Màn hình lớn YouTube (`src/game/videoScreen.ts`, `src/components/TvPanel.tsx`), **thêm vào chứ không thay màn LED**: đặt đúng chỗ màn hình hội trường của bản gốc (vách phía bắc, trên bệ sân khấu, đối diện dãy ghế hội trường; ngồi ghế là xem được). Màn LED động và dải chân dung tuyển thủ chuyển sang vách phía đông, nút 📺 trên thanh trên cùng mở bảng điều khiển (phát video của hang, dán link YouTube, tạm dừng/tiếp, bài kế, tắt tiếng, tắt). Trình phát là iframe thật ở lớp CSS3D dưới canvas; mặt màn hình trong cảnh "đục lỗ" nên người/cột đứng trước vẫn che đúng. Chưa bấm thì không có yêu cầu mạng nào tới bên thứ ba. Link dán chỉ phát ở máy người dán (không gửi lên server).
- Chưa kiểm chứng: phát video YouTube thật (bài e2e dùng trang giả lập), điều khiển qua postMessage với trình phát thật, chạy trên iOS Safari (CSS3D + canvas trong suốt), FPS trên thiết bị thật.

**Đảo bố cục theo góp ý "sân thi đấu ở giữa, khán giả ngồi rìa"** (đối chiếu ảnh sân khấu LCK/LoL Park bạn gửi): 
- Giữa sân là **bục thi đấu** (bán kính 11,5, cao 1 m): sàn tối có đường LED hình sao, hai dãy 5 bàn tuyển thủ hình cung đối diện nhau (bên đỏ Tê Đỏ, bên xanh đối thủ) với ghế gaming, màn hình, tuyển thủ ngồi thi đấu, tấm LED cong phía sau, cúp ở tâm, năm hình nộm (mục tiêu ném đồ) đứng quanh cúp. Người chơi **không bước lên được** bục.
- Quanh bục là sàn phẳng cho người chơi đi lại, rồi hàng rào LED, rồi **khán đài 6 bậc ở rìa** (ngoài vòng đi bộ, chỉ là hình ảnh, hàng trăm khán giả, ghế khảm đỏ-trắng-than chì, biển khu A–D). Khoảng trống không có khán đài ở lối vào (nam) và phía màn hình hội trường (bắc).
- Màn LED động chuyển lên treo trên cửa vào; màn YouTube vẫn ở hội trường; bảng treo MU nâng cao lên (không che sân khấu).
- **Thay đổi vật lý (shared/world.mjs):** sàn phẳng (`floorHeight` luôn 0), bỏ hố lửa 5 bậc và 154 ghế bậc thang, vùng chặn giữa sân đổi từ đống lửa 2,65 sang bục 11,5. Bố cục khán đài ở `src/game/layout.ts`, `stands.ts`; bục ở `podium.ts`. Đây là **khác biệt có chủ đích so với bản gốc**.

**Khán đài leo được + màn LED trung tâm (theo góp ý "cho người chơi lên các khu vực xung quanh, thể hiện rõ các bậc đi, và không thấy màn LED giữa sân"):**
- Khán đài 7 bậc (mỗi bậc cao 0,75 m, rộng 2,2 m) nay là **địa hình đi được**: `floorHeight` dâng theo bậc, vòng đi bộ mở rộng tới 55,2 (thay 42 của bản gốc), băng ghế khán đài và hai tường chắn ở lối vào/hội trường là vật cản (`shared/world.mjs`, server kiểm tra cùng hàm). Sáu cầu thang lối đi (rộng 3 m) có thảm sáng, vạch đỏ ở mép mỗi bậc, vạch LED trắng ở mép bậc, tay vịn hai bên, biển khu A–D ở chân cầu thang. Camera bị kẹp trong vòm khi leo sát tường.
- Màn LED động nay là **vương miện 4 mặt treo ngay trên bục giữa sân** (lăng trụ thẳng đứng, không nghiêng, nhìn thấy từ mọi hướng). Trung tâm chỉ còn **một** màn hình này: khối bảng tỷ số MU bốn mặt đã được dời thành **hai bảng phẳng gắn vách phía bắc**, hai bên màn hình hội trường, mỗi bảng kèm biển gợi ý V/R (trước đó hai khối chồng lên nhau và bị méo khi nhìn xiên từ dưới). Trước đó màn LED treo ở cửa vào, nằm sau lưng người chơi lúc vào hang nên không thấy. Có thể ngẩng nhìn lên nhẹ (giới hạn −0,3 rad) để thấy trần; trước đó cho ngẩng gần thẳng đứng nên hình bị kéo méo.
- Chưa làm: chỗ ngồi trên khán đài (ghế khán đài chỉ để ngắm/chắn đường, bấm E ngồi vẫn chỉ ở hội trường).

**Nội dung bóng đá đã thay bằng esport (2026-11-12, theo yêu cầu):**
- Đã gỡ: bộ theo dõi trận (match.ts), màn ăn mừng bàn thắng (goal.ts, GoalOverlay), bảng tỷ số MU (scoreboard.ts), proxy ESPN trên server (`/ext/espn/*`, biến `ESPN_*`) và các bài thử/dữ liệu mẫu của chúng. Không còn gọi dịch vụ bên thứ ba nào cho dữ liệu trận.
- Thay bằng: hai bảng xếp hạng LCK trên vách bắc (lckBoard.ts) và chip/bảng LCK ở cột phải (LckWidget.tsx), số liệu từ `teams.ts` do bạn cung cấp, NHẬP TAY (không phải dữ liệu trực tiếp; điểm số/lịch trực tiếp cần một nguồn dữ liệu esport, tôi chưa chọn vì không kiểm chứng được điều khoản của các API công khai).
- Quiz: 14 câu mới về Liên Minh Huyền Thoại/LCK/T1 trong server/lib/quiz.mjs, viết từ kiến thức sẵn có, CHƯA kiểm chứng trực tuyến: bạn nên đọc lại.
- Thông báo mời group Tele đã bỏ câu chữ bóng đá (trận MU, tỷ số, giờ bóng lăn). Tên "group Tele HangMu" và link `t.me/hangmu_online` vẫn là nhóm của bản gốc (nội dung nhóm có thể vẫn về MU: tôi không kiểm tra được); nhãn "group Telegram Hang MU" trong hộp thoại pháp lý giữ vì trỏ đúng nhóm đó. Bạn có nhóm riêng thì đổi `TELEGRAM_URL` trong legal.ts và các nhãn này.
- Tiếng khán đài reo đổi tên `goal` → `cheer` (hiện chưa nơi nào gọi). Tên nội bộ `Footballer`/`jerseyTexture` trong person.ts và khoá `hangmu.*` giữ nguyên (chỉ là tên mã).
- Câu chữ điều khoản ("không liên kết với T1, Riot Games…") là bản nháp của tôi; bạn nên tự rà trước khi dùng thật.
- Các từ "Hội trường đá", "hang", "hình nộm rơm" giữ nguyên (có trong bản gốc và test).

**Sửa lỗi khán đài (2026-11-11):**
- Ghế nhấp nháy trắng/đen khi đổi góc nhìn: `caveMesh.ts` vẽ "ghế hội trường" từ toàn bộ `BENCH_OBSTACLES` nên 508 băng ghế khán đài (và 4 tường) bị vẽ chồng thêm một lớp ghế trắng cùng toạ độ, cùng độ cao với lớp ghế đỏ/trắng/than của `stands.ts` → z-fighting. Nay chỉ vẽ 50 ghế hội trường.
- Leo khán đài bị "kéo xuống": [Inference] nguyên nhân tìm được bằng mô phỏng, không xác nhận được trên máy bạn. Giữa hai băng ghế liền nhau có khe 0,25 m; người ép chéo vào khe bị hai đầu ghế đẩy ngược chiều, lọt vào hộp, rồi bị đẩy xuyên sang hàng bên kia; vị trí đó server (cùng hàm va chạm, dung sai 0,2 m) từ chối và gửi correction. Nay hộp va chạm dài hơn ghế vẽ (`STAND_BENCH_REACH` = 1,24 m) nên hai băng chồng nhau, không còn khe. Hình vẽ không đổi.
- Server đang chạy phải khởi động lại sau mỗi lần đổi `shared/world.mjs` (`npm run dev` chỉ chạy server một lần; Vite chỉ nạp lại phía client). Server cũ dùng địa hình cũ sẽ kéo người chơi về chỗ cũ khi họ leo tới bậc mà địa hình cũ không có.

- Camera chui vào thân khán đài (2026-11-12): đứng sát chân khán đài, quay lưng ra phía khán đài, camera (14 m phía sau) nằm lọt trong các bậc nên ngẩng lên và lia chuột thấy đáy/mặt trong bậc. Nay `src/game/cameraGuard.ts` kiểm tra đoạn nhìn từ người chơi tới camera (và 4 điểm quanh camera) có xuống dưới mặt khối đặc (bậc khán đài, bục thi đấu, bệ hội trường) không; có thì kéo camera lại gần tới khi thoáng (tối thiểu 1,2 m). Điểm nhìn khi ngẩng lên co theo khoảng cách camera để camera gần người không thành nhìn thẳng lên trần.

**Phối lại màu và tạm bỏ người giả (2026-11-12):**
- Bảng màu đổi từ trắng-xám-đỏ sang nhà thi đấu esport: không gian xanh than đậm, sàn/vòm xanh xám (đã bỏ họa tiết ô lục giác, xem dòng dưới), đèn LED viền bậc, vòng sàn, giàn đèn, chùm sáng màu lục lam (#3fc8ff) và tím (#8a6cff), cúp vàng. Đỏ chỉ còn ở phía Tê Đỏ (bàn trên bục, màn LED, biểu ngữ, huy hiệu) và xanh dương ở phía đối thủ. Màu nằm ở `PALETTE` (arenaTextures.ts), caveMesh.ts, venue.ts, stands.ts, podium.ts, buntingLayout.ts.
- Người giả tắt bằng một công tắc `SHOW_FAKE_PEOPLE = false` ở layout.ts: khán giả trên khán đài, tuyển thủ ngồi ở bục và 5 hình nộm trên bục (chỉ hiện khi vào chế độ ném đồ T). Đổi thành true để bật lại; mã dựng vẫn còn. Người chơi thật và bot vẫn có.
- Đã bỏ họa tiết ô tổ ong (lục giác) ở sàn và vòm trần theo yêu cầu: sàn là một màu xanh than liền với các vòng sáng và chữ; vòm là một màu liền (`domeTexture`, trước đây `hexPanelTexture`). Sàn sảnh (Cave.tsx) dùng chung hàm nên cũng thành màu liền. Còn lục giác ở huy hiệu, áp phích màn YouTube.
- Đã bỏ dây cờ tam giác treo trần theo yêu cầu: chỉ bỏ lời gọi `addBunting` trong caveMesh.ts; `bunting.ts`, `buntingLayout.ts` và bài thử vẫn còn (gọi lại là có cờ). Biểu ngữ dọc của Tê Đỏ trên vách vẫn giữ.
- Trần thêm (theo yêu cầu): màn LED chạy vòng quanh trần (dải trên mặt vòm giữa khoảng cách 34–40 m tới trục, chữ cuộn quanh, viền LED lục lam; chỉ cuộn texture nên rẻ) và 24 vạch LED liền từ đỉnh ra rìa xen giữa các gân, một màu lục lam sáng dịu nhịp chậm (bản đầu là 360 thanh nét đứt nhiều màu, bị chê rối mắt nên đổi; các thanh chéo cũ trên trần cũng chỉ còn một màu, tối hơn). Code: venue.ts `addCeilingScreen`, `addCeilingLeds`.
- Biểu ngữ 2026-11-12 (theo yêu cầu): bỏ 8 biểu ngữ dọc "TÊ ĐỎ" và 10 khung chân dung "huyền thoại" (đều bị vòm cắt mất nửa trên vì treo cao hơn mặt vòm tại chỗ đó); thay bằng 10 biểu ngữ đội LCK (`teams.ts` dữ liệu, `teamBanners.ts` vẽ): hạng, logo hoặc huy hiệu chữ cái, tên, vé quốc tế, thành tích. Treo cách trục 48 m, đáy cao 6,7 m, rộng 4 m; bài thử `tests/unit/teams.test.mjs` kiểm tra đỉnh biểu ngữ nằm dưới mặt vòm. Số liệu từng đội do bạn cung cấp, tôi chưa kiểm chứng.
- Logo: tải từ Wikimedia Commons theo yêu cầu của bạn cho 4 đội (Gen.G, Hanwha Life Esports, T1, Dplus KIA), lưu ở `public/teams/` kèm `CREDITS.md` (trang Commons ghi "Public domain" nhưng đó là nhãn hiệu của đội và tôi chưa kiểm tra pháp lý). 6 đội còn lại (KT Rolster, BNK FEARX, Hanjin BRION, NS RedForce, Kiwoom DRX, DN SOOPers) chưa có logo dùng được trên Commons/Wikipedia (chỉ có logo tên cũ), nên hiện là huy hiệu chữ cái tự tạo. Muốn thêm logo: bỏ `public/teams/<slug>.png` (slug trong `teams.ts`) rồi thêm slug vào `LOGO_FILES`.
- `public/legends/legends.json` và cơ chế nạp ảnh huyền thoại không còn dùng (đã bỏ code); tệp để lại chưa xóa.
- Chữ chạy trên màn LED trần đã đổi chiều (chạy ngược hướng đọc như bảng chạy chữ) và bỏ chữ trên mặt sàn.
**Phòng chờ (2026-11-12, theo yêu cầu "làm phần A"):**
- Khu sofa ở khoảng trống phía nam (giữa chỗ xuất hiện và cổng vào): thảm có viền LED, ba bộ sofa (3 + 3 + 4 = 10 ghế) quay vào bàn thấp, một tấm màn đứng hai mặt ghi "PHÒNG CHỜ" và hiện bảng xếp hạng LCK. Code: `shared/world.mjs` (`LOUNGE_*`, `SEATS`), `src/game/lounge.ts`, `src/game/zones.ts`.
- Ngồi bằng cùng cơ chế ghế hội trường (E / nút 🪑): giao thức `sit`/`seat` giữ nguyên, chỉ số ghế 0–49 là hội trường, 50–59 là phòng chờ. Server đặt người ngồi theo `heading` của ghế và đứng dậy ở `exit` của ghế (hội trường vẫn quay mặt −z, bước ra 1,15 m như cũ).
- Sofa, bàn và tấm màn là vật cản thật (nằm trong `BENCH_OBSTACLES`, server kiểm tra như ghế khác).
- Chưa làm (đã nêu như phần tuỳ chọn): chọn vị trí Top/Jungle/Mid/ADC/Support hiện trên đầu; màn phụ chỉ hiện bảng LCK tĩnh; chưa có ghế/đồ trang trí khác.
- Việc ngồi ở phòng chờ không tắt/bật micro hay màn hình hội trường: màn hình YouTube chỉ gắn với ghế hội trường như trước.
**Ngồi thật + cửa vào khu đặc biệt (2026-11-12, theo góp ý của bạn):**
- Lỗi "bấm E nhưng chưa thật sự ngồi": gốc là tư thế ngồi bị **ngược dấu** (`SEATED` trong gait.ts và `poseFootballer`): quy ước của rig là góc ÂM đưa chi ra trước, nhưng đùi được đặt +1,25 (chĩa ra SAU lưng) và gối −1,35 (gập sai chiều), nên người chơi trông như đứng trong ghế. Đã sửa: đùi −1,25 (ra trước, mặt trên đùi ở 0,46 m = độ cao mặt ghế), gối +1,35, tay đặt hơi ra trước. Bài thử mới kiểm tra bằng hình học (đầu gối ở phía trước hông, đùi gần ngang, cẳng chân rủ xuống). Người ngồi ở sofa dịch ra trước 0,12 m để lưng không lọt vào tựa ghế. Ghi chú: lỗi này có từ lúc làm ghế hội trường, nên người ngồi ở hội trường cũng được sửa theo.
- Khán đài: trước đây bấm E trên khán đài không có tác dụng (chưa có ghế). Nay mỗi băng ghế ngồi được 3 người (1 494 ghế, chỉ số 60+), ngồi đúng độ cao bậc, mặt về giữa sân, đứng dậy ra phía trước (`STAND_SEATS`).
- Cửa vào: **sân thi đấu** (bục giữa sân) và **phòng chờ** nay quây kín (vành bục chặn cả hai chiều; phòng chờ có tường kính), không đi bộ vào được; đứng gần cổng vòm (ô sáng trên sàn) rồi bấm E mới vào, bấm E ở đầu trong để ra. Server kiểm tra khoảng cách (`{t:'gate', id}`, từ chối bằng `gateDenied`; đang ngồi/chat riêng/đấu thì không qua được). Cửa: `GATES` trong shared/world.mjs; hình ảnh: gates.ts.
- Sân thi đấu nay lên được (cao 1 m): vành bục không còn là đĩa đặc mà là vành chặn hai chiều; bàn thi đấu và bệ cúp là vật cản thật, bố cục bàn dùng chung giữa podium.ts và va chạm (`PODIUM_LAYOUT`).
- Camera: không chui vào sofa, tường kính, tấm màn, bàn thi đấu và vòm cổng vào phía nam (cameraGuard.ts).
- Chưa làm (bạn nói sẽ làm chi tiết sau): nội dung bên trong sân thi đấu và phòng chờ (hiện chỉ có đi lại, ngồi sofa). Chưa có thông báo cho người khác khi ai đó vào/ra khu; server chỉ giữ vị trí, chưa lưu "đang ở khu nào".
**Bỏ biển sân thi đấu + gợi ý thao tác rõ hơn (2026-11-13):**
- Cửa sân thi đấu không còn cổng vòm/biển (theo yêu cầu); chỉ còn hai ô sáng trên sàn đánh dấu chỗ bấm E. Cửa phòng chờ vẫn giữ cổng vòm.
- Dòng gợi ý (`.hang-hint`): chữ trắng tinh, đậm, viền bóng tối dày. Khi là một thao tác cụ thể ("… bấm E để ngồi/vào/ra", "bấm F để đấm", 🪑/👊 trên điện thoại) thì hiện nổi bật: chữ to hơn, nền xanh đậm, viền sáng lục lam, phím vẽ thành ô phím. Câu hướng dẫn chung (WASD…) giữ dạng thường. [Inference] Tham khảo bản gốc: không có ảnh chụp dòng gợi ý thao tác của bản gốc; kiểu ô phím lấy theo ô "Nhấn [Enter] để nhắn tin" trong ảnh chụp bản gốc.
- Camera: đứng ở chỗ xuất hiện ngay trước phòng chờ, camera không còn thò vào phòng chờ (bị tấm màn che kín màn hình); camera bị kéo gần thì hạ thấp theo, nhìn qua vai.
**Tạo nhân vật (2026-11-13, theo đề xuất đã duyệt: mục 1, 2, 3, 6):**
- Hộp thoại "Tạo nhân vật" thay cho hộp thoại nhập tên cũ (`CharacterDialog.tsx`): xem trước 3D bên trái (tự xoay, kéo để xoay, nút 🎉 Ăn mừng, nút 🎲 Ngẫu nhiên), lựa chọn bên phải: tên, đội cổ vũ (10 đội LCK → màu áo), màu da (5), kiểu tóc (4: ngắn, đầu đinh, dài, mào), màu tóc (5). Điện thoại xếp dọc. Chế độ nhẹ / tắt chuyển động: xem trước đứng yên, chỉ vẽ lại khi đổi lựa chọn.
- Áo chỉ dùng màu + họa tiết tự vẽ, không in logo. [Inference] Màu áo từng đội là màu gần đúng tôi tự chọn (`src/game/kits.ts`), chưa đối chiếu tài liệu chính thức. Áo T1 giữ đúng màu cũ nên người chưa chọn gì không thấy khác.
- Đồng bộ: mã ngoại hình 12 bit (`shared/look.mjs`) gửi kèm khi vào hang, có trong danh sách người chơi; server kiểm tra (mã sai → mặc định) và lưu vào hồ sơ `/api/me` (cột thứ 5 khi lưu bền vững; hồ sơ cũ vẫn đọc được). Bot nhận ngoại hình ngẫu nhiên.
- Nhớ lựa chọn: `localStorage hangmu.look` + hồ sơ trên server. Đổi trang phục ngay trong hang: nút 👕 Trang phục ở góc trái dưới (hộp thoại chỉ đổi ngoại hình; tên/số áo đổi ở sảnh, nút "Đổi nhân vật").
- Hiệu năng: vật liệu theo đội/da/màu tóc tạo một lần và dùng chung; ảnh nhân vật ở xa (impostor) mỗi đội một ảnh, vẽ khi có người đầu tiên mặc áo đội đó. Chưa đo FPS trên máy thật với nhiều đội cùng lúc.
- Chưa làm (đợt sau theo đề xuất): phụ kiện (tai nghe, mũ, kính, gậy cổ vũ), chọn vị trí Top/Jungle/Mid/ADC/Support.
- Bỏ số áo (2026-11-13, theo nhận xét: áo esport Liên Minh không có số): hộp thoại không còn ô số áo, lưng áo không in số, sảnh không hiện "số N"; số áo đã lưu từ trước bị bỏ qua. Trường `n` trong giao thức vẫn giữ (luôn rỗng) để tương thích.
**Tên sau lưng áo + phụ kiện meme (2026-11-13, theo yêu cầu):**
- Lưng áo in tên nhân vật (chữ in hoa màu nhấn của đội, viền màu thân áo; tên dài thì thu nhỏ chữ), thay chỗ số áo cũ. Chỉ vẽ khi nhân vật ở gần (mức chi tiết đầy đủ).
- Phụ kiện (hộp thoại tạo nhân vật / 👕 Áo, mục "Phụ kiện"): trên mặt (kính cận, kính râm kiểu "deal with it", tai nghe gaming có mic), mang theo (bình oxi đeo lưng có dây thở lên mũi, gậy cổ vũ phát sáng màu đội cầm tay phải), di chuyển (đi bộ / xe lăn). Tất cả tự dựng bằng hình khối (`src/game/accessories.ts`).
- Xe lăn: nhân vật luôn ngồi trên xe; đi thì hai bánh lớn lăn đúng theo quãng đường (bán kính bánh 0,3 m) và hai tay đẩy vành bánh theo nhịp; đứng yên thì bánh dừng. Ngồi ghế hội trường / sofa / khán đài thì cất xe (ngồi hẳn lên ghế). Va chạm và tốc độ không đổi (xe lăn chỉ là hình ảnh).
- Mã ngoại hình mở rộng 12 → 17 bit (`shared/look.mjs`); mã cũ không có phụ kiện vẫn hợp lệ. Bot có phụ kiện ngẫu nhiên (xe lăn ~1/5).
- Sàn đấu võ nay dựng nhân vật đúng trang phục của hai người (trước đây luôn là áo mặc định).
- Nút đổi trang phục chuyển lên thanh trên cùng ("👕 Áo", cạnh "Ném đồ") vì ở góc dưới nó làm dòng gợi ý bị chen ở màn 1100 px.
- Hạn chế: nhân vật ở rất xa dùng ảnh đại diện theo đội (không có phụ kiện, không có xe lăn).
**Xe lăn chuyển động giống người thật hơn (2026-11-13, theo yêu cầu):** `src/game/wheelchair.ts`
- Trước đây tay chỉ vung trong không khí: tay chibi (với 0,46 m từ vai) không chạm được vành bánh. Nay khi ngồi xe, người ngồi thấp hơn 0,25 m (ghế thấp kiểu xe lăn thể thao), bánh đường kính 0,7 m, có vành đẩy riêng; bàn tay bám đúng vành nhờ IK hai đoạn (vai → khuỷu → bàn tay).
- Nhịp đẩy như người thật: bắt vành sau đỉnh bánh (−20°), đẩy vòng ra trước tới +40° rồi nhả (~42% chu kỳ), thân gập về trước theo lực đẩy; sau đó nhấc tay vòng phía trên vành về chỗ bắt, thân ngả lại. Nhịp 0,7–1,5 lần/giây theo tốc độ.
- Rẽ: hai bánh lăn vi sai (bánh ngoài nhanh hơn; xoay tại chỗ thì một bánh lăn tới, một bánh lăn lùi, tay bên đó kéo ngược). Bánh trước tách riêng: xoay theo hướng chuyển động (có độ trễ) và lăn.
- Đứng yên: hai tay đặt hờ trên vành; dừng gấp: tay giữ vành, thân ngả sau. Chân luôn nằm trên chỗ để chân, đầu nhìn thẳng dù thân gập. Đang đấm / ăn mừng thì tay đó theo động tác đấm / ăn mừng.
- Khung xem trước khi tạo nhân vật dùng cùng tư thế (tay đặt trên vành).
- Kiểm thử: `tests/unit/wheelchair.test.mjs` (9 bài: IK tới đích < 1 mm; suốt lúc bám vành bàn tay lệch vành < 2 cm; thân gập theo nhịp; bánh vi sai; bánh trước; chân/đệm; phanh). Đột biến (không hạ người, sai dấu IK, bỏ vi sai, chân không bù nghiêng) đều bị bắt.
- Hạn chế: tốc độ trong game 8 m/s nhanh hơn người đẩy xe thật nhiều nên tay không thể theo kịp vành đang quay (tay trượt trên vành khi chạy nhanh). Nhãn tên vẫn ở độ cao cũ (cao hơn đầu một chút khi ngồi xe).
**Mặt nạ thở + ăn mừng trên xe lăn (2026-11-13, theo yêu cầu):**
- Bình oxi: thay ống thở mũi bằng mặt nạ thở trùm mũi + miệng (vỏ nhựa trong, viền xanh, đầu nối dưới đáy, dây đeo vòng dưới mắt ra sau gáy); ống dẫn từ bình nối vào đầu nối mặt nạ.
- Ăn mừng (G / nút Ăn mừng / nút cổ vũ ở khung xem trước) khi ngồi xe lăn — trước đây không có động tác gì vì dáng ăn mừng bị tắt khi ngồi. Theo góp ý ("hai tay cầm cả xe lăn giơ lên như nâng cúp"): đứng dậy, vung xe lên trước ngực rồi giơ thẳng hai tay nâng cả chiếc xe lên quá đầu, nhảy 2 lần (khuỵu gối lấy đà, nhún xe), ngửa mặt nhìn xe, rồi hạ xe ngồi lại. Tổng 2,4 s như ăn mừng thường. (Bản đầu là bốc đầu xe + nhảy, đã thay.)
- Tay chibi giơ thẳng chỉ cao ~1,75 m (đỉnh đầu 1,91 m) nên tay đỡ ở đáy hai bánh lớn: hai bánh nằm hai bên đầu, đệm ghế nằm trên đỉnh đầu. Lúc vung xe lên/xuống (~0,25 s mỗi chiều) xe đi ngang trước ngực/mặt.
- Người + xe chung một nhóm (`Ride.carrier`) để nhảy cùng nhau; xe nhấc khỏi đất thì bánh không lăn theo đường đi. Đang ăn mừng dở mà ngồi ghế thì xe/người về chỗ.
- Kiểm thử: `wheelchair.test.mjs` (mượt, đúng 2 cú nhảy, xe lên > 1,6 m; suốt động tác bàn tay luôn nắm xe (lệch < 2 cm); khi giơ xe đệm ghế cao hơn đỉnh đầu; đứng thẳng; xong ngồi lại vào đệm; mặt nạ thở). `character.test.mjs`: bấm G khi ngồi xe lăn trong trình duyệt → xe lên > 1,5 m rồi hạ xuống.
**Sửa camera giật khi chạy thẳng (2026-11-13, lỗi bạn báo):**
- Nguyên nhân: vướng vật sau lưng (phòng chờ ngay sau chỗ xuất hiện, khán đài, bục...) thì khoảng cách camera thu theo từng nấc ×0,88; chạy đi thì khoảng cách nhảy cả nấc trong một khung (đo được 0,6–1,7 m) → cảnh phía trước giật. Thêm hai chỗ dò thưa trong `cameraGuard.ts` (10 mẫu cố định trên đoạn nhìn, 4 điểm quanh camera cách 0,35 m) lọt qua tường kính dày 0,3 m nên khoảng cách chập chờn.
- Sửa: `src/game/cameraRig.ts` tìm khoảng cách thoáng liên tục (dò từ trong ra rồi chia đôi); vướng thì kéo vào ngay, hết vướng thì lùi ra mượt (tối đa 6 m/s). Dò đoạn nhìn mỗi ≤ 0,15 m và 3 vòng điểm quanh camera. Chi phí đo trên máy này 0,05–0,44 ms/khung.
- Kiểm thử: `tests/unit/cameraRig.test.mjs` (4 bài), `tests/e2e/camera.test.mjs` (chạy thẳng từ chỗ xuất hiện trong trình duyệt: 0,10–0,15 m/khung; đưa thuật toán cũ vào thì 1,7 m/khung → bài thử báo lỗi).
**Vào hang mất ngoại hình đã tạo (2026-11-13, lỗi bạn báo):** không phải lỗi code. Server `npm run lan` chạy từ 09:20 (trước khi thêm phụ kiện) nên còn kiểm tra mã ngoại hình kiểu 12 bit; trong khi đó `dist/` đã build lại bằng bản mới. Chọn phụ kiện thì mã > 0xfff, server cũ coi là sai và trả cả bộ (đội, tóc, da...) về mặc định. Cách sửa: khởi động lại `npm run lan`. Bài thử `character.test.mjs` nay tạo nhân vật có kính + bình oxi + xe lăn ngay từ đầu, kiểm tra người khác thấy đúng mã và có xe lăn. Giả lập server cũ thì bài thử báo lỗi.
- Chưa đổi màu: cảnh sảnh (Cave.tsx), giao diện HTML (nút, bảng) vẫn đỏ/trắng, (bảng MU trên vách đã thay bằng bảng LCK), chân dung "huyền thoại" (chỉ đổi nền sang xanh), các hình nhân vật chơi (áo đỏ-đen).

**Chat nhanh, thoát ô chat, thông báo nổi bật, ăn mừng dài hơn + pháo giấy (2026-11-13, theo yêu cầu):**
- Chat nhanh: nút ⚡ cạnh ô chat (máy tính và điện thoại) mở danh sách 6 câu có sẵn (`src/content/quickChat.ts`); chọn là gửi như tin thường (khung chat + bong bóng trên đầu), danh sách tự đóng; Esc chỉ đóng danh sách (trước đây Esc trong hang = rời hang). Câu 3 ghép thành "2 thằng mày nằm xuống! Thầy tính cả rồi.". Cả 6 câu qua bộ lọc chat của server nguyên văn (đã kiểm tra).
- Phím tắt chat nhanh: 1–6 (hàng số hoặc bàn phím số) gửi thẳng câu tương ứng, không cần mở danh sách; đang gõ chat thì là chữ bình thường; danh sách ⚡ hiện số phím cạnh mỗi câu (ẩn trên màn hình cảm ứng); bảng phím (H) có dòng "1 – 6 Chat nhanh".
- Bong bóng chat trên đầu (`src/game/bubble.ts`): chữ tự xuống dòng (tối đa 4 dòng, ~640 px/dòng), bong bóng rộng/cao theo nội dung, mũi nhọn giữ chỗ cũ trên đầu. Trước đây cắt ở 48 ký tự nên câu chat nhanh "Oh look at the cleanse, look at the moves! Faker, what was that?!" (65 ký tự) bị mất chữ; nay hiện đủ 2 dòng. Khung chat và danh sách ⚡ vốn tự xuống dòng nên không phải nới rộng.
- Thoát ô chat: gửi xong (Enter / nút Gửi) tự rời ô chat, phím trả về cho nhân vật; Enter khi ô trống cũng thoát; đang gõ có dòng nhắc "Enter gửi · Esc thoát ô chat để di chuyển". Tin bị chặn (gửi quá nhanh) thì giữ ô chat để gửi lại.
- Thông báo nổi bật: biểu ngữ lớn giữa phía trên màn hình (viền vàng phát sáng, bật vào rồi nháy sáng 3 lần), hiện 6 s (trước 4,2 s). Người vào hang: "**Faker** vừa mới vào hang, ae giao lưu tí nhỉ" (nhiều người: "A và B vừa mới vào hang, ae giao lưu tí nhỉ"; từ 10 người vẫn gộp "🔥 N anh em vừa vào hang!"). Áp dụng cho mọi thông báo sự kiện (vào hang, vào Tele, kết quả võ); thông báo hệ thống ngắn (gửi quá nhanh, kết nối lại...) cũng có viền vàng, chữ to hơn.
- Ăn mừng: 2,4 s → 5,4 s (thêm 3 s). Khoảng cách tối thiểu giữa hai lần ăn mừng nâng từ 2,5 s lên 5,5 s (server + client) để không bị bấm chồng; nếu vẫn nhận được lệnh khi đang ăn mừng thì bỏ qua (không giật về đầu động tác). Xe lăn: thời gian giơ xe dài hơn, nhảy 5 lần rồi đứng nhún gối nhún xe như nâng cúp.
- Pháo giấy (`src/game/confetti.ts`): lúc bắt đầu ăn mừng bắn một phát giấy màu tung lên quanh người, sau đó mưa giấy rơi lả tả quanh người suốt lúc ăn mừng, cứ ~1,4 s thêm một phát nhỏ; mảnh giấy hai mặt, lật vòng, chao qua lại khi rơi (rơi tối đa 1,3 m/s), rơi xuống sàn nằm lại rồi co lại biến mất. Màu: bảng màu tươi + màu áo đội của người ăn mừng. Một InstancedMesh cho mọi mảnh (1 lần vẽ), tối đa 1.500 mảnh (600 ở chế độ nhẹ / giảm chuyển động). Khung xem trước (nút Cổ vũ) cũng có.
- Kiểm thử: `tests/unit/confetti.test.mjs`, `notices.test.mjs` (câu mới), `gait.test.mjs` (không bắt đầu lại khi đang ăn mừng), `wheelchair.test.mjs` (đệm ghế không chạm đầu suốt 5,4 s); e2e `quickchat.test.mjs` (chat nhanh máy tính + điện thoại, Esc, thoát ô chat rồi W đi được), `desktop.test.mjs` (biểu ngữ giữa phía trên, chữ ≥ 17 px; có pháo giấy khi ăn mừng).
- Chưa làm: âm thanh riêng cho thông báo / pháo giấy (không có trong yêu cầu).
- Esc ngay sau khi gửi chat (trong 2 s, khi ô chat đã tự đóng) không làm rời hang: trước đây Esc khi không mở gì = rời hang, nên thói quen "Esc để thoát ô chat" sẽ văng khỏi hang. Bài thử desktop cũ bấm Esc sau khi chat đã bắt được lỗi này.
- Điện thoại: biểu ngữ nằm dưới chip LCK (màn dọc), thu gọn ở màn hình thấp (ngang) để không đè dòng gợi ý.
- Lỗi đã biết (môi trường thử, không phải bản chạy thật): khi máy rất tải (Spotlight + máy ảo Docker, load 11–16), trang thử thứ hai đôi khi mất ~35 s mới dựng xong và kết nối WebSocket qua proxy của vite dev bị đóng trước khi tới server (log debug của server không thấy lệnh `enter`) → "Không vào được hang". Tái hiện 2/3 lần bằng kịch bản tối giản, có hay không có bot đều vậy. Bản production / `npm run lan` không đi qua proxy này (bộ e2e prod đạt). Chưa sửa.

**Trò chơi 1: "Bẫy Độc Noxus" (2026-11-13, theo yêu cầu; luật chi tiết do tôi thiết kế dựa trên mô tả của bạn):**
- Mời: đứng gần người khác bấm 🍄 (phím B); người kia đồng ý (Y / nút) thì cả hai vào trận, đứng yên, "bận" với người khác.
- Luật (`shared/trap.mjs`, dùng chung server/client/kiểm thử): mỗi người một con đường 6 hàng × 3 ô, xuất phát dưới, đích trên.
  1. Giấu nấm (40 s, cùng lúc): mỗi người cắm 5 nấm lên đường đối thủ; mỗi hàng tối đa 2 nấm (luôn còn lối đi). Hết giờ chưa cắm đủ thì máy cắm nốt ngẫu nhiên. Cả hai giấu xong thì bắt đầu ngay.
  2. Dò đường theo lượt (15 s/lượt): cả hai bí mật chọn một ô ở hàng kế tiếp, lật cùng lúc (không ai lợi vì đi trước). Ô an toàn → tiến một hàng; dẫm nấm → mất 1 mạng, nấm lộ ra, đứng yên chọn lại lượt sau. Hết giờ chưa chọn thì máy chọn ngẫu nhiên ô chưa lộ nấm.
  3. Thắng: tới đích trước; hết 3 mạng thì thua; cùng tới đích một lượt → ai còn nhiều mạng hơn thắng, bằng nhau hoà; bỏ cuộc / mất kết nối → xử thua.
- Thông báo cho cả hang: biểu ngữ nổi bật "🍄 Teemo thắng Bẫy Độc Noxus trước Keria" + dòng phụ số mạng còn lại (hoà / bỏ cuộc có câu riêng).
- Giao diện (`TrapOverlay.tsx`): lớp phủ hai làn "Đường của bạn" (dò đường: hàng kế tiếp sáng lên, bấm ô hoặc phím 1–3, dấu chân 👣, nấm đã dẫm + khói độc, rung) và "Đường của đối thủ" (lúc đầu bấm ô để cắm/nhổ nấm, báo lý do khi cắm quá 2 nấm một hàng; sau đó xem đối thủ dò, thấy nấm mình đã cắm). Thanh thời gian, tim mạng hai bên, nhãn vị trí hai người. Hết trận lộ toàn bộ nấm, thẻ kết quả nằm dưới hai làn. Esc = hỏi bỏ cuộc / đóng kết quả; Enter = giấu nấm xong. Điện thoại: lúc giấu nấm chỉ hiện làn đối thủ, lúc dò đường hai làn thu nhỏ cạnh nhau. Cây nấm là SVG tự vẽ (mũ tím chấm xanh), không dùng hình của Riot.
- Trong lúc chơi, biểu ngữ thông báo chuyển xuống đáy màn hình để không che bàn chơi.
- Server (`hangmu-server.mjs`): lời mời kind `trap`, tin `{t:'game', g:'trap'}`; nấm trên đường mình không gửi cho mình cho tới khi dẫm phải / hết trận. Biến môi trường thử: TRAP_PLACE_MS, TRAP_TURN_MS, TRAP_REVEAL_MS.
- Kiểm thử: `tests/unit/trap.test.mjs` (5), `tests/server/trap.test.mjs` (4: mời/bận, cắm sai luật bị từ chối, lật cùng lúc, mất mạng, tới đích, thông báo toàn hang, máy cắm/chọn hộ khi hết giờ, hết mạng, bỏ cuộc, mất kết nối), `tests/e2e/trap.test.mjs` (7: mời bằng B/Y, giấu nấm + luật hàng, dò đường bằng phím và bấm ô, dẫm nấm, về đích, kết quả, biểu ngữ toàn hang, bỏ cuộc, điện thoại 390×844 vừa màn hình).
- Chỉnh theo góp ý (2026-11-13) "giao diện hơi khó chơi, chỉ cần 2 ô, làm rõ màn của mình với màn người khác": mỗi hàng còn 2 ô trái/phải (kiểu cầu kính), mỗi hàng tối đa 1 nấm; bấm ô kia cùng hàng thì nấm đổi bên; phím 1–2. Làn đang thao tác (giấu nấm: đường đối thủ; dò đường: đường của mình) đứng trước, to hơn, viền sáng; làn còn lại nhỏ và mờ. Nhãn màu "🧍 BẠN" (vàng) / "🎯 ĐỐI THỦ" (hồng), mỗi làn có một dòng giải thích đang xảy ra gì. Bảng phím (H) gộp V / R / B thành một dòng để không dài thêm.
- Bài đo bố cục e2e coi biểu ngữ thông báo (`.hang-event`) là lớp phủ: không tính chồng chéo (nó cố ý nổi trên mọi thứ, không chặn bấm, tự tắt sau 6 s) nhưng vẫn phải nằm trong màn hình.
- Chưa làm: bảng xếp hạng riêng cho Bẫy Độc, cảnh 3D (hiện là lớp phủ 2D), người xem trận. Tên "Noxus"/"Teemo" là tên riêng của Riot Games (bạn đặt) — chưa kiểm tra vấn đề bản quyền khi phát hành công khai.

## 3. Đang làm dở / lỗi đã biết

1. QR ủng hộ và tài khoản ngân hàng vẫn của bản gốc (cần ảnh QR của bạn).
2. Chip LCK, `RankPanel` và `VolumePanel` còn tồn tại song song với giao diện mới (xem mục 2).
3. Người ngồi hiện chỉ được biểu diễn bằng tư thế ngồi tại ghế; chưa có hiệu ứng nào khác.
4. Server chỉ kiểm tra vật cản, không kiểm tra "đường đi" giữa hai bản tin (đã có giới hạn tốc độ).
5. Chưa thử trên iPhone thật: âm thanh iOS, cảm ứng, PWA, sàn đấu và ném đồ trên điện thoại, hiệu năng với màn hình treo và cờ.
6. Đo hiệu năng đám đông đã chạy lại (xem mục 5); vẫn chưa đo FPS trên điện thoại thật.
7. HTTPS/Caddy, systemd, `docker compose up` đủ bộ chưa kiểm chứng trên máy thật.

## 4. Chờ bạn quyết định (không tự làm)

- Luật chơi Kéo co 2v2 và Ôm bóng, hoặc video quay lại bản gốc.
- Ảnh QR ủng hộ của bạn.
- Giữ hay bỏ chat giọng và báo cáo/bỏ phiếu.
- Giữ hay bỏ các mục 🅼 ở bảng trên.

## 5. Đo hiệu năng đám đông (sau màn hình treo, cờ, ghế, vật lý, ngồi ghế)

Chạy máy tính xách tay, WebGL phần mềm (SwiftShader nên nhịp khung chỉ để so sánh tương đối). Các script đo đã đổi sang người đi bộ trung thực (`tests/helpers/walker.mjs`) vì server nay sửa vị trí xuyên vật cản.

| Bài đo | Kết quả | So với lần đo cũ |
|---|---|---|
| `perf:actors` 500 diễn viên | 1.517 draw call, 164 nghìn tam giác, heap 47 MB, 545 texture, 57 geometry (không tăng theo số người) | cũ ≈ 1.520 draw call, ~183 nghìn tam giác, heap ~44 MB: không xấu đi |
| `perf:actors` 5 diễn viên (cảnh trống) | 123 draw call, 27 nghìn tam giác | — |
| `perf:network` 495 người, thực tế | 3,02 MB/s, 6,3 KB/s mỗi người, CPU server 15% | cũ 3,2–3,4 MB/s |
| `perf:network` 495 người, xấu nhất (mỗi người gửi 10 lần/giây) | 13,2 MB/s, 27 KB/s mỗi người, CPU server 25% | chưa có số cũ để so |
| `perf:soak` 400 người, 330 giây | heap server ổn định ở ~32 MB (độ dốc 0,91 MB/phút toàn kỳ, nửa sau 0), 414 người giữ ổn định, 808 lượt vào, 392 rớt mạng, 256 nối lại, 330 trận duel | cũ: không thấy rò rỉ |
| `perf:accuracy` (độ lệch vị trí người khác hiển thị) | lọc mặc định: gần ≈ 10 đv lệch TB 0,64 (p95 1,52); tầm trung ≈ 36 đv lệch TB 0,99 (p95 2,24); xa ≈ 73 đv 0,01 | chưa có số cũ để so |

Số liệu tầm trung cho thấy người ở 20–45 đơn vị (cập nhật 3,3 lần/giây) lệch hiển thị trung bình ~1 đơn vị, gấp đôi lúc tắt lọc (0,5).
