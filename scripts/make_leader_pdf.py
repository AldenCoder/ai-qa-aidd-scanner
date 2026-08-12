import json
import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
SUMMARY_PATH = ROOT / "evals" / "results" / "latest_summary.json"
OUTPUT = WORKSPACE / "output" / "pdf" / "AI_QA_AIDD_Feasibility_Leader_Brief.pdf"


def register_fonts():
    regular = Path("C:/Windows/Fonts/arial.ttf")
    bold = Path("C:/Windows/Fonts/arialbd.ttf")
    pdfmetrics.registerFont(TTFont("Arial", str(regular)))
    pdfmetrics.registerFont(TTFont("Arial-Bold", str(bold)))


def pct(value):
    if isinstance(value, bool):
        value = 1 if value else 0
    return f"{value * 100:.0f}%"


def money(input_tokens, output_tokens, input_price, output_price):
    return (input_tokens / 1_000_000 * input_price) + (output_tokens / 1_000_000 * output_price)


def wrap_text(c, text, width, font="Arial", size=8):
    words = str(text).split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if c.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(c, text, x, y, width, font="Arial", size=8, leading=10, color=colors.HexColor("#27313A")):
    c.setFillColor(color)
    c.setFont(font, size)
    for line in wrap_text(c, text, width, font, size):
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_header(c, page_no, title):
    w, h = A4
    c.setFillColor(colors.HexColor("#153243"))
    c.rect(0, h - 18 * mm, w, 18 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Arial-Bold", 13)
    c.drawString(16 * mm, h - 11.5 * mm, title)
    c.setFont("Arial", 8)
    c.drawRightString(w - 16 * mm, h - 11.5 * mm, f"Research date: 12/08/2026 | Page {page_no}/2")


def draw_footer(c, run_id):
    w, _ = A4
    c.setStrokeColor(colors.HexColor("#CBD5DF"))
    c.line(16 * mm, 13 * mm, w - 16 * mm, 13 * mm)
    c.setFillColor(colors.HexColor("#5A6570"))
    c.setFont("Arial", 7)
    c.drawString(16 * mm, 8.8 * mm, f"Local PoC run: {run_id} | Raw logs and evidence are stored under ai-qa-poc/evals/results and ai-qa-poc/evidence.")


def draw_card(c, x, y, w, h, title, body, fill, border, title_color=None):
    c.setFillColor(fill)
    c.setStrokeColor(border)
    c.roundRect(x, y - h, w, h, 5, stroke=1, fill=1)
    c.setFillColor(title_color or border)
    c.setFont("Arial-Bold", 10)
    c.drawString(x + 8, y - 14, title)
    draw_wrapped(c, body, x + 8, y - 28, w - 16, size=8, leading=9)


def draw_table(c, x, y, col_widths, headers, rows, row_h=15, font_size=7.2):
    total_w = sum(col_widths)
    c.setFillColor(colors.HexColor("#153243"))
    c.rect(x, y - row_h, total_w, row_h, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Arial-Bold", font_size)
    cursor = x
    for i, header in enumerate(headers):
        c.drawString(cursor + 4, y - 10, header)
        cursor += col_widths[i]
    y -= row_h

    for idx, row in enumerate(rows):
        c.setFillColor(colors.HexColor("#F5F7FA") if idx % 2 == 0 else colors.white)
        c.rect(x, y - row_h, total_w, row_h, stroke=0, fill=1)
        c.setStrokeColor(colors.HexColor("#DCE3EA"))
        c.line(x, y - row_h, x + total_w, y - row_h)
        c.setFillColor(colors.HexColor("#27313A"))
        c.setFont("Arial", font_size)
        cursor = x
        for i, cell in enumerate(row):
            lines = wrap_text(c, cell, col_widths[i] - 8, "Arial", font_size)
            for line_idx, line in enumerate(lines[:2]):
                c.drawString(cursor + 4, y - 10 - line_idx * 7, line)
            cursor += col_widths[i]
        y -= row_h
    return y


def draw_score_bar(c, x, y, label, score, max_score=10):
    c.setFillColor(colors.HexColor("#27313A"))
    c.setFont("Arial", 7.5)
    c.drawString(x, y, label)
    bar_x = x + 62 * mm
    bar_w = 45 * mm
    c.setFillColor(colors.HexColor("#E7EDF2"))
    c.roundRect(bar_x, y - 1.2 * mm, bar_w, 3.2 * mm, 1.3, stroke=0, fill=1)
    fill_w = bar_w * score / max_score
    c.setFillColor(colors.HexColor("#2A9D8F") if score >= 7 else colors.HexColor("#E9A53F"))
    c.roundRect(bar_x, y - 1.2 * mm, fill_w, 3.2 * mm, 1.3, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#27313A"))
    c.setFont("Arial-Bold", 7.5)
    c.drawRightString(bar_x + bar_w + 15 * mm, y, f"{score:.1f}/10")


def page_one(c, summary, pass_runs):
    w, h = A4
    draw_header(c, 1, "AI QA AIDD Feasibility - Leader Brief")
    run_id = summary["run_id"]
    draw_footer(c, run_id)

    left = 16 * mm
    top = h - 27 * mm
    content_w = w - 32 * mm

    c.setFillColor(colors.HexColor("#0F2530"))
    c.setFont("Arial-Bold", 18)
    c.drawString(left, top, "Kết luận nhanh: CONDITIONAL GO")
    c.setFont("Arial", 9)
    c.setFillColor(colors.HexColor("#5A6570"))
    c.drawString(left, top - 13, "Nên làm theo phase, bắt đầu bằng test design + review + automation có human gate. Chưa GO cho full autonomous QA.")

    draw_card(
        c,
        left,
        top - 25,
        content_w * 0.49,
        32 * mm,
        "Điểm quyết định",
        "PoC local chứng minh guardrail chain hoạt động: expected result không có source bị chặn; missing/conflict không automate; seeded product bug làm test fail, không bị che.",
        colors.HexColor("#EAF6F3"),
        colors.HexColor("#2A9D8F"),
    )
    draw_card(
        c,
        left + content_w * 0.51,
        top - 25,
        content_w * 0.49,
        32 * mm,
        "Giới hạn bằng chứng",
        "Benchmark model Sonnet/Opus thực tế đang BLOCKED vì chưa có API key. Số liệu dưới đây đo harness, validator, automation và evidence local, không phải chất lượng LLM live.",
        colors.HexColor("#FFF5E7"),
        colors.HexColor("#D18420"),
    )

    counts = summary["counts"]
    m = summary["metrics"]
    rows = [
        ["Rule extraction recall / precision", f"{pct(m['rule_extraction_recall'])} / {pct(m['rule_extraction_precision'])}", "Đủ rule fixture, không sinh rule ngoài source"],
        ["Source traceability", pct(m["source_traceability_rate"]), "Mọi rule/testcase đều có source"],
        ["Unsupported expected result", pct(m["unsupported_expected_result_rate"]), "0% là acceptance bắt buộc"],
        ["Missing / conflict detection", f"{pct(m['missing_detection_accuracy'])} / {pct(m['conflict_detection_accuracy'])}", "Không tự chọn rule thiếu/mâu thuẫn"],
        ["Boundary coverage", pct(m["boundary_coverage"]), "0, 1, 100, 101 được sinh đủ"],
        ["Duplicate / reviewer catch", f"{pct(m['duplicate_detector_seed_catch_rate'])} / {pct(m['reviewer_catch_rate'])}", "Seed duplicate và wrong-source đều bị bắt"],
        ["Automation compile/load", pct(m["automation_compile_rate"]), "Playwright generated tests load được"],
        ["Known-good execution", f"{counts['known_good_tests']['expected']}/{counts['known_good_tests']['total']} pass", "App đúng pass toàn bộ"],
        ["Seeded bug detection", f"{counts['seeded_bug_tests']['unexpected']} expected failures", "quantity=0 bị app cho qua và test bắt được"],
        ["False pass / false fail", f"{pct(m['false_pass_rate'])} / {pct(m['false_fail_rate'])}", "Metric quan trọng nhất cho leader"],
        ["Human intervention", pct(m["human_intervention_rate"]), "2/10 case cần review do MISSING/CONFLICT"],
        ["Latency local", f"{m['latency_seconds_total']}s/run", f"Stable pass runs after fix: {pass_runs}"],
    ]
    draw_table(c, left, top - 72 * mm, [49 * mm, 33 * mm, 95 * mm], ["Metric", "Result", "Meaning"], rows, row_h=12.4 * mm, font_size=7.1)

    c.setFillColor(colors.HexColor("#5A6570"))
    c.setFont("Arial", 7)
    c.drawString(left, 18 * mm, "Primary sources verified: Anthropic Claude Projects/RAG, Claude Code features, Agent SDK, hooks, context engineering, evals; Playwright agents/API/trace docs.")


def page_two(c, summary):
    w, h = A4
    draw_header(c, 2, "AI QA AIDD Feasibility - Recommendation")
    draw_footer(c, summary["run_id"])

    left = 16 * mm
    top = h - 27 * mm
    content_w = w - 32 * mm

    c.setFillColor(colors.HexColor("#0F2530"))
    c.setFont("Arial-Bold", 14)
    c.drawString(left, top, "Feasibility by automation level")
    levels = [
        ("L1 Docs -> Manual testcases", 8.5, "Ready for pilot with schema + source traceability."),
        ("L2 Docs -> Testcases -> QA review", 8.0, "Ready for pilot; reviewer and validators are mandatory."),
        ("L3 -> Automation generation", 7.0, "Conditional; only from APPROVED cases."),
        ("L4 -> Execute + evidence/bug", 7.0, "Conditional; Playwright/API path is workable."),
        ("L5 Continuous autonomous QA", 4.0, "Not production-ready; needs real app benchmark, governance, and drift monitoring."),
    ]
    y = top - 12
    for label, score, note in levels:
        draw_score_bar(c, left, y, label, score)
        draw_wrapped(c, note, left + 125 * mm, y, content_w - 125 * mm, size=7.4, leading=8)
        y -= 13 * mm

    c.setFillColor(colors.HexColor("#0F2530"))
    c.setFont("Arial-Bold", 12)
    c.drawString(left, y - 2 * mm, "Recommended architecture")
    y -= 9 * mm
    arch_rows = [
        ["Source of Truth", "Git repo with versioned product/API/screen docs; generated artifacts separated."],
        ["Context", "Knowledge index + filesystem discovery first; vector DB only after measured retrieval bottleneck."],
        ["Claude setup", "CLAUDE.md for always-on rules; Skills for QA procedures; subagents only for isolated heavy review/research."],
        ["Guardrails", "JSON schema, deterministic validators, duplicate detector, independent review, approval state, hooks/audit."],
        ["Automation", "Reuse Playwright Planner/Generator/Healer, but lock business assertions and block MISSING/CONFLICT automation."],
        ["Orchestration", "Claude Code for phase 1 pilot; Agent SDK when moving to CI/non-interactive workflow."],
    ]
    y = draw_table(c, left, y, [38 * mm, 139 * mm], ["Area", "Decision"], arch_rows, row_h=12.2 * mm, font_size=7.2)

    sonnet_cost = money(20_000, 4_000, 2, 10)
    opus_cost = money(20_000, 4_000, 5, 25)
    c.setFillColor(colors.HexColor("#0F2530"))
    c.setFont("Arial-Bold", 12)
    c.drawString(left, y - 6 * mm, "Model routing and economics")
    y -= 13 * mm
    model_text = (
        f"Use Sonnet 5 as default for extraction, testcase generation, and routine automation; use Opus 5 for high-risk conflict review, architecture decisions, and difficult debug. "
        f"Official API price estimate for a 20k input / 4k output task: Sonnet 5 about ${sonnet_cost:.2f}, Opus 5 about ${opus_cost:.2f}. "
        "Live quality/cost benchmark is BLOCKED until an Anthropic API key is provided."
    )
    y = draw_wrapped(c, model_text, left, y, content_w, size=8, leading=9)

    c.setFillColor(colors.HexColor("#0F2530"))
    c.setFont("Arial-Bold", 12)
    c.drawString(left, y - 4 * mm, "30/60/90 day plan")
    y -= 11 * mm
    plan_rows = [
        ["30d", "Pilot one real module: normalize docs, freeze schema, run eval suite, require human approval."],
        ["60d", "Add CI + Agent SDK runner, dashboards for false-pass, missing/conflict, reviewer catch, cost/latency."],
        ["90d", "Expand to more modules, decide RAG/vector DB from measured retrieval failure, harden healer policy."],
    ]
    y = draw_table(c, left, y, [18 * mm, 159 * mm], ["Phase", "Focus"], plan_rows, row_h=11.4 * mm, font_size=7.2)

    c.setFillColor(colors.HexColor("#A43D2B"))
    c.setFont("Arial-Bold", 10)
    c.drawString(left, y - 6 * mm, "Final recommendation")
    y -= 12 * mm
    final_text = (
        "CONDITIONAL GO: start phase 1 up to Level 4 in controlled pilot. Do not approve Level 5 autonomous QA until live model benchmark on a real module proves stable grounding, low false-pass, acceptable cost, and auditable human gates."
    )
    draw_wrapped(c, final_text, left, y, content_w, font="Arial-Bold", size=8.3, leading=9.5, color=colors.HexColor("#27313A"))


def count_clean_pass_runs():
    total = 0
    for summary_file in (ROOT / "evals" / "results").glob("run-*/summary.json"):
        try:
            data = json.loads(summary_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        known = data.get("counts", {}).get("known_good_tests", {})
        bug = data.get("counts", {}).get("seeded_bug_tests", {})
        if known.get("expected") == 12 and bug.get("unexpected") == 2:
            total += 1
    return total


def main():
    register_fonts()
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("AI QA AIDD Feasibility Leader Brief")
    page_one(c, summary, count_clean_pass_runs())
    c.showPage()
    page_two(c, summary)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
