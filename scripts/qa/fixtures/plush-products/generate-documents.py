from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


def main():
    directory = Path(__file__).resolve().parent
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    document = canvas.Canvas(str(directory / "order-requirements.pdf"), pagesize=A4, invariant=1)
    document.setTitle("产品与包装要求")
    document.setAuthor("产品资料")
    document.setFont("STSong-Light", 22)
    document.drawString(48, 785, "产品与包装要求")
    document.setFont("STSong-Light", 12)
    for index, line in enumerate([
        "产品名称：云朵小熊",
        "款式：米白短毛绒，胸前云朵贴布",
        "尺寸：坐高 25 厘米；单只装袋，每箱 12 只",
        "外观：面料干净，左右对称，眼鼻绣线平整",
        "包装：吊牌与洗水标齐全，装箱前核对数量",
        "交付：确认样品、用料与包装资料后安排生产",
    ]):
        document.drawString(48, 744 - index * 26, line)
    document.drawImage(str(directory / "cloud_bear.jpg"), 140, 150, width=315, height=315, preserveAspectRatio=True)
    document.setFont("STSong-Light", 10)
    document.drawString(48, 65, "资料日期：2026-11-07")
    document.drawRightString(545, 65, "第 1 页")
    document.save()


if __name__ == "__main__":
    main()
