import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
SUMMARY = ROOT / "evals" / "results" / "latest_summary.json"
OUTPUT = WORKSPACE / "output" / "pdf" / "AI_QA_AIDD_Bao_Cao_Tieng_Viet_Don_Gian.pdf"


BLACK = colors.HexColor("#111111")
TEXT = colors.HexColor("#222222")
GRAY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#F3F4F6")
MID = colors.HexColor("#D9DDE3")
DARK = colors.HexColor("#2F343A")


def register_fonts():
    pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))


def wrap(c, text, width, font="Arial", size=8.5):
    words = str(text).split()
    lines = []
    cur = ""
    for word in words:
        candidate = word if not cur else f"{cur} {word}"
        if c.stringWidth(candidate, font, size) <= width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def text(c, value, x, y, width=None, font="Arial", size=8.5, leading=10, color=TEXT):
    c.setFont(font, size)
    c.setFillColor(color)
    if width is None:
        c.drawString(x, y, value)
        return y - leading
    for line in wrap(c, value, width, font, size):
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c, page, title):
    w, h = A4
    c.setFillColor(BLACK)
    c.rect(0, h - 15 * mm, w, 15 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Arial-Bold", 12)
    c.drawString(15 * mm, h - 9.5 * mm, title)
    c.setFont("Arial", 8)
    c.drawRightString(w - 15 * mm, h - 9.5 * mm, f"12/08/2026 | Trang {page}/2")


def footer(c, run_id):
    w, _ = A4
    c.setStrokeColor(MID)
    c.line(15 * mm, 13 * mm, w - 15 * mm, 13 * mm)
    c.setFillColor(GRAY)
    c.setFont("Arial", 7)
    c.drawString(15 * mm, 8.8 * mm, f"PoC local: {run_id} | Raw data: ai-qa-poc/evals/results/latest_summary.json")


def section(c, label, x, y):
    c.setFillColor(BLACK)
    c.setFont("Arial-Bold", 11)
    c.drawString(x, y, label)
    c.setStrokeColor(MID)
    c.line(x, y - 3, A4[0] - 15 * mm, y - 3)
    return y - 10


def simple_box(c, x, y, w, h, title, body_lines):
    c.setFillColor(LIGHT)
    c.setStrokeColor(MID)
    c.rect(x, y - h, w, h, stroke=1, fill=1)
    c.setFillColor(BLACK)
    c.setFont("Arial-Bold", 9.5)
    c.drawString(x + 6, y - 12, title)
    yy = y - 25
    for line in body_lines:
        yy = text(c, line, x + 6, yy, w - 12, size=8, leading=9.2)


def table(c, x, y, widths, headers, rows, row_h=12 * mm, size=7.2):
    total = sum(widths)
    c.setFillColor(DARK)
    c.rect(x, y - 9 * mm, total, 9 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Arial-Bold", size)
    xx = x
    for i, h in enumerate(headers):
        c.drawString(xx + 3, y - 6 * mm, h)
        xx += widths[i]
    y -= 9 * mm
    for idx, row in enumerate(rows):
        c.setFillColor(colors.white if idx % 2 else LIGHT)
        c.rect(x, y - row_h, total, row_h, stroke=0, fill=1)
        c.setStrokeColor(MID)
        c.line(x, y - row_h, x + total, y - row_h)
        c.setFillColor(TEXT)
        c.setFont("Arial", size)
        xx = x
        for i, cell in enumerate(row):
            lines = wrap(c, cell, widths[i] - 6, "Arial", size)
            for li, line in enumerate(lines[:3]):
                c.drawString(xx + 3, y - 6 * mm - li * 7.2, line)
            xx += widths[i]
        y -= row_h
    return y


def percent(value):
    return f"{value * 100:.0f}%"


def page1(c, data):
    w, h = A4
    left = 15 * mm
    content_w = w - 30 * mm
    run_id = data["run_id"]
    m = data["metrics"]
    counts = data["counts"]
    header(c, 1, "Báo cáo khả thi AI hỗ trợ Tester")
    footer(c, run_id)

    y = h - 25 * mm
    c.setFillColor(BLACK)
    c.setFont("Arial-Bold", 17)
    c.drawString(left, y, "Kết luận: LÀM ĐƯỢC, nhưng phải làm theo phase")
    y -= 9 * mm
    y = text(
        c,
        "Không nên làm kiểu upload toàn bộ knowledge vào Claude Project rồi kỳ vọng AI tự sinh testcase đúng. Nên chuyển sang workflow có source rõ ràng, rule matrix, validator, review gate và automation chỉ chạy từ testcase đã duyệt.",
        left,
        y,
        content_w,
        size=8.7,
        leading=10,
    )

    y -= 4 * mm
    simple_box(
        c,
        left,
        y,
        content_w,
        34 * mm,
        "Trả lời trọng tâm cho đề bài ban đầu",
        [
            "1. Có làm được không? Có. Phase hiện tại sinh tài liệu kiểm thử/testcase có thể pilot được.",
            "2. Làm bằng cách nào? Tách Source of Truth khỏi output AI; dùng index theo screen_id/API/flow; tạo Rule Matrix trước; validate schema; reviewer duyệt; automation chỉ từ testcase APPROVED.",
            "3. Không nên kết luận full autonomous QA ngay. Cần human review ở các điểm thiếu rule, conflict, expected result và business assertion.",
        ],
    )
    y -= 42 * mm

    y = section(c, "Mức đáp ứng yêu cầu", left, y)
    score_rows = [
        ["Phase hiện tại: sinh tài liệu kiểm thử", "85%", "Đủ tốt để pilot. 8/10 testcase được approve tự động; 2/10 cần human review đúng như thiết kế."],
        ["PoC end-to-end local", "78%", "Đã chứng minh docs -> rule -> testcase -> review -> automation -> evidence trên app demo."],
        ["Production full autonomous QA", "65%", "Chưa đủ để GO toàn phần vì thiếu benchmark model trên module thật và quy trình vận hành nhiều tester."],
    ]
    y = table(c, left, y, [48 * mm, 22 * mm, content_w - 70 * mm], ["Phạm vi", "Đạt", "Lý do"], score_rows, row_h=16 * mm, size=7.3)

    y -= 7 * mm
    y = section(c, "Số liệu PoC đã chạy", left, y)
    metric_rows = [
        ["Rule extraction recall / precision", f"{percent(m['rule_extraction_recall'])} / {percent(m['rule_extraction_precision'])}", "Không sinh rule ngoài source fixture."],
        ["Source traceability", percent(m["source_traceability_rate"]), "Mọi rule/testcase đều có source."],
        ["Expected result không có căn cứ", percent(m["unsupported_expected_result_rate"]), "0% - điểm quan trọng nhất để chống AI bịa."],
        ["Missing / conflict detection", f"{percent(m['missing_detection_accuracy'])} / {percent(m['conflict_detection_accuracy'])}", "Case thiếu rule và conflict đều bị đưa vào human review."],
        ["Boundary coverage", percent(m["boundary_coverage"]), "Đủ 0, 1, 100, 101 cho quantity."],
        ["Automation", f"{counts['known_good_tests']['expected']}/{counts['known_good_tests']['total']} pass", "App đúng pass toàn bộ test generated."],
        ["Seeded bug", f"{counts['seeded_bug_tests']['unexpected']} fail đúng", "Bug quantity=0 bị bắt, không sửa assertion để che bug."],
        ["False pass / false fail", f"{percent(m['false_pass_rate'])} / {percent(m['false_fail_rate'])}", "Trong PoC local hiện tại."],
    ]
    table(c, left, y, [58 * mm, 30 * mm, content_w - 88 * mm], ["Chỉ số", "Kết quả", "Ý nghĩa"], metric_rows, row_h=11.2 * mm, size=7.1)


def page2(c, data):
    w, h = A4
    left = 15 * mm
    content_w = w - 30 * mm
    header(c, 2, "Cách làm đề xuất và điểm trừ")
    footer(c, data["run_id"])

    y = h - 25 * mm
    y = section(c, "Cách triển khai nên làm", left, y)
    impl_rows = [
        ["1. Knowledge", "Đưa tài liệu vào Git theo nhóm: screen, API, flow, business rule, QA procedure. Claude Project chỉ giữ cho Q&A/ad-hoc, không làm nơi chứa toàn bộ sự thật nghiệp vụ."],
        ["2. Context", "Không upload hết vào model. Dùng INDEX theo screen_id để lấy đúng screen + API + flow + rule liên quan. RAG/vector DB chỉ dùng nếu search filesystem không đủ."],
        ["3. Rule Matrix", "AI phải extract rule trước khi sinh testcase. Rule có status CONFIRMED, MISSING, CONFLICT. MISSING/CONFLICT không được có expected result tự bịa."],
        ["4. Testcase", "Sinh testcase theo schema. Mỗi expected result bắt buộc có rule_id + source. Có duplicate detector và reviewer."],
        ["5. Automation", "Dùng Playwright cho web/API. Chỉ generate automation từ testcase APPROVED. Healer chỉ sửa locator/wait, không sửa expected result."],
        ["6. Vận hành team", "Dùng branch/PR, version QA skills, audit log, dashboard metric. Human review là gate bắt buộc ở các case rủi ro."],
    ]
    y = table(c, left, y, [34 * mm, content_w - 34 * mm], ["Hạng mục", "Cách làm"], impl_rows, row_h=15.5 * mm, size=7.0)

    y -= 7 * mm
    y = section(c, "Điểm trừ / rủi ro còn lại", left, y)
    risk_rows = [
        ["Chưa benchmark model live", "Chưa có API key để chạy Sonnet/Opus trên cùng eval suite. Vì vậy chưa chốt model routing bằng số liệu thực tế."],
        ["Demo dùng app nhỏ", "PoC chứng minh kiến trúc, chưa đại diện đầy đủ cho hệ thống thật có nhiều màn hình, rule chéo, dữ liệu phức tạp."],
        ["Retrieval vẫn là rủi ro", "Nếu index sai hoặc tài liệu source thiếu chuẩn, AI vẫn có thể lấy nhầm context. Cần chuẩn hóa tài liệu trước."],
        ["Automation có thể false-pass", "Nếu assertion sai từ đầu hoặc healer được phép sửa business assertion, test có thể pass giả. Phải khóa assertion bằng source/rule."],
        ["Multi-user dễ drift", "Nhiều tester sửa instruction/knowledge mà không versioning sẽ làm chất lượng không ổn định. Cần Git + review."],
    ]
    y = table(c, left, y, [45 * mm, content_w - 45 * mm], ["Điểm trừ", "Tác động"], risk_rows, row_h=13.8 * mm, size=7.1)

    y -= 7 * mm
    y = section(c, "Khuyến nghị GO / NO-GO", left, y)
    reco = [
        "GO cho pilot Phase 1: Docs -> Rule Matrix -> Testcase -> QA Review.",
        "CONDITIONAL GO cho Phase 2: generate automation và chạy test, nhưng chỉ với testcase APPROVED và có review assertion.",
        "NO-GO tạm thời cho full autonomous QA production cho đến khi benchmark trên module thật đạt false-pass thấp, chi phí ổn và có audit/human gate.",
    ]
    for item in reco:
        y = text(c, "- " + item, left, y, content_w, size=8.1, leading=9.5)

    y -= 3 * mm
    y = section(c, "Kết luận ngắn để báo leader", left, y)
    final = (
        "Dự án nên làm. Trọng tâm không phải chọn Sonnet hay Opus trước, mà là xây pipeline có kiểm soát: source rõ ràng, rule matrix, validator, reviewer, approval state và automation có evidence. Nếu làm theo hướng này, phase sinh tài liệu kiểm thử đạt khoảng 85% mức sẵn sàng pilot. Nếu muốn tự động xuyên suốt tới automation production, hiện mới khoảng 65% vì còn thiếu benchmark model và dữ liệu thực tế."
    )
    text(c, final, left, y, content_w, font="Arial-Bold", size=8.2, leading=9.5)


def main():
    register_fonts()
    data = json.loads(SUMMARY.read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("Bao cao AI QA AIDD tieng Viet don gian")
    page1(c, data)
    c.showPage()
    page2(c, data)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
